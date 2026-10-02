/**
 * Timetable generation + persistence.
 * Uses the preserved constraint engine from shared/timetable-engine.ts
 */

import {
  collection,
  doc,
  getDocs,
  setDoc,
  addDoc,
  query,
  orderBy,
  limit,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import { generateTimetable, validateTimetableReadiness } from "@shared/timetable-engine";
import type {
  EngineInput,
  EngineResult,
  GeneratedEntry,
  Timetable,
  TimetableEntry,
  School,
} from "@shared/types";
import {
  listTeachers,
  listClasses,
  listLearningAreas,
  listPeriods,
  listAllocations,
  listAvailability,
  getScheduleSettings,
  getSchool,
} from "./schoolService";

function nowIso() {
  return new Date().toISOString();
}

/** Shared electives → class locks (engine) + per-subject display entries */
async function loadElectiveLocksAndEntries(schoolId: string): Promise<{
  locks: GeneratedEntry[];
  displayEntries: Array<GeneratedEntry & { electiveSessionId?: string; teacherCodes?: string[] }>;
}> {
  const snap = await getDocs(collection(db, "schools", schoolId, "electiveSessions"));
  const teachers = await listTeachers(schoolId);
  const codeToId = new Map(
    teachers.map((t) => [(t.identifier || "").toUpperCase(), t.id])
  );
  const locks: GeneratedEntry[] = [];
  const displayEntries: Array<
    GeneratedEntry & { electiveSessionId?: string; teacherCodes?: string[] }
  > = [];

  for (const d of snap.docs) {
    const s = d.data() as {
      classIds?: string[];
      learningAreaIds?: string[];
      teacherCodes?: string[];
      dayName?: string;
      periodNumber?: number;
    };
    const classIds = s.classIds || [];
    const areaIds = s.learningAreaIds || [];
    const codes = (s.teacherCodes || []).map((c) => String(c).toUpperCase());
    const dayName = s.dayName || "Monday";
    const periodNumber = Number(s.periodNumber) || 1;
    if (!classIds.length || !areaIds.length) continue;

    let teacherId = "";
    for (const c of codes) {
      const id = codeToId.get(c);
      if (id) {
        teacherId = id;
        break;
      }
    }
    if (!teacherId && teachers[0]) teacherId = teachers[0].id;
    if (!teacherId) teacherId = "elective";

    // One class lock only (do not lock all teachers — avoids false multi-stream conflicts)
    for (const classId of classIds) {
      locks.push({
        dayName,
        periodNumber,
        classId,
        teacherId,
        learningAreaId: areaIds[0],
        lessonType: "lesson",
        locked: true,
        jointGroupId: d.id,
      });
      for (const learningAreaId of areaIds) {
        displayEntries.push({
          dayName,
          periodNumber,
          classId,
          teacherId,
          learningAreaId,
          lessonType: "lesson",
          locked: true,
          jointGroupId: d.id,
          electiveSessionId: d.id,
          teacherCodes: codes,
        });
      }
    }
  }
  return { locks, displayEntries };
}


/** Build engine input from live Firestore data */
export async function buildEngineInput(
  schoolId: string,
  lockedEntries: GeneratedEntry[] = []
): Promise<EngineInput | null> {
  const [school, teachers, classes, areas, periods, allocations, availability, settings] =
    await Promise.all([
      getSchool(schoolId),
      listTeachers(schoolId),
      listClasses(schoolId),
      listLearningAreas(schoolId),
      listPeriods(schoolId),
      listAllocations(schoolId),
      listAvailability(schoolId),
      getScheduleSettings(schoolId),
    ]);

  if (!school) return null;

  const days = settings?.workingDays?.length
    ? settings.workingDays
    : ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

  const approved = allocations.filter((a) => a.status === "approved");

  return {
    days,
    periods: periods.map((p) => ({
      periodNumber: p.periodNumber,
      kind: p.kind,
      startTime: p.startTime,
      endTime: p.endTime,
      displayOrder: p.displayOrder,
    })),
    teachers: teachers
      .filter((t) => t.active !== false)
      .map((t) => ({ id: t.id, fullName: t.fullName, identifier: t.identifier })),
    classes: classes
      .filter((c) => c.active !== false)
      .map((c) => ({ id: c.id, name: c.name })),
    learningAreas: areas
      .filter((a) => a.active !== false)
      .map((a) => ({ id: a.id, name: a.name, code: a.code })),
    allocations: approved.map((a) => ({
      id: a.id,
      teacherId: a.teacherId,
      classId: a.classId,
      extraClassIds: (a as { extraClassIds?: string[] }).extraClassIds || [],
      learningAreaId: a.learningAreaId,
      lessonsPerWeek: a.lessonsPerWeek,
      doubleLessons: a.doubleLessons,
      status: a.status,
      room: (a as { room?: string }).room || undefined,
      parallelGroupId: (a as { parallelGroupId?: string }).parallelGroupId || undefined,
    })),
    availability: availability.map((av) => ({
      entityType: av.entityType,
      entityId: av.entityId,
      dayName: av.dayName,
      periodNumber: av.periodNumber,
      state: av.state,
    })),
    lockedEntries,
  };
}

export async function generateAndSaveTimetable(
  schoolId: string,
  userId: string,
  options?: { preserveLocks?: boolean; existingTimetableId?: string }
): Promise<{ timetableId: string; result: EngineResult; school: School }> {
  const school = await getSchool(schoolId);
  if (!school) throw new Error("School not found");

  let lockedEntries: GeneratedEntry[] = [];
  if (options?.preserveLocks && options.existingTimetableId) {
    const entriesSnap = await getDocs(
      collection(db, "schools", schoolId, "timetables", options.existingTimetableId, "entries")
    );
    lockedEntries = entriesSnap.docs
      .map((d) => ({ id: d.id, ...d.data() } as TimetableEntry))
      .filter((e) => e.locked)
      .map((e) => ({
        dayName: e.dayName,
        periodNumber: e.periodNumber,
        classId: e.classId,
        teacherId: e.teacherId,
        learningAreaId: e.learningAreaId,
        lessonType: e.lessonType,
        locked: true,
      }));
  }

  const elective = await loadElectiveLocksAndEntries(schoolId);
  // Class-slot locks only — shared elective is one logical event, not a teacher conflict per stream
  lockedEntries = [...lockedEntries, ...elective.locks];

  const input = await buildEngineInput(schoolId, lockedEntries);
  if (!input) throw new Error("Could not build engine input");
  if (input.allocations.length === 0) {
    throw new Error("No approved allocations. Approve allocations before generating.");
  }

  const readiness = validateTimetableReadiness(input);
  const result = generateTimetable(input);
  // Surface pre-checks as guidance when generation left conflicts
  if (readiness.length && result.conflicts.length) {
    for (const issue of readiness.slice(0, 5)) {
      result.conflicts.unshift({
        allocationId: "",
        classId: "",
        teacherId: "",
        learningAreaId: "",
        message: `Readiness — ${issue.category}: ${issue.summary}`,
        reasons: [issue.details],
        suggestions: issue.tips,
      });
    }
  }
  // Attach elective display entries (stacked subjects) for each participating stream
  for (const e of elective.displayEntries) {
    result.entries.push({
      dayName: e.dayName,
      periodNumber: e.periodNumber,
      classId: e.classId,
      teacherId: e.teacherId,
      learningAreaId: e.learningAreaId,
      lessonType: "lesson",
      locked: true,
      jointGroupId: e.jointGroupId,
    });
  }

  const ttRef = await addDoc(collection(db, "schools", schoolId, "timetables"), {
    schoolId,
    name: `${school.academicYear} ${school.term}`,
    academicYear: school.academicYear,
    term: school.term,
    status: "generated",
    version: 1,
    createdBy: userId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    score: result.score,
    scheduledLessons: result.scheduledLessons,
    requiredLessons: result.requiredLessons,
    conflictCount: result.conflicts.length,
  });

  const batchSize = 400;
  for (let i = 0; i < result.entries.length; i += batchSize) {
    const batch = writeBatch(db);
    const slice = result.entries.slice(i, i + batchSize);
    for (const entry of slice) {
      const entryRef = doc(collection(db, "schools", schoolId, "timetables", ttRef.id, "entries"));
      batch.set(entryRef, {
        schoolId,
        timetableId: ttRef.id,
        dayName: entry.dayName,
        periodNumber: entry.periodNumber,
        classId: entry.classId,
        teacherId: entry.teacherId,
        learningAreaId: entry.learningAreaId,
        lessonType: entry.lessonType,
        locked: entry.locked,
        room: entry.room || null,
        jointGroupId: entry.jointGroupId || null,
        parallelGroupId: entry.parallelGroupId || null,
        createdAt: nowIso(),
      });
    }
    await batch.commit();
  }

  await setDoc(
    doc(db, "schools", schoolId, "timetables", ttRef.id),
    { conflicts: result.conflicts, updatedAt: nowIso() },
    { merge: true }
  );

  return { timetableId: ttRef.id, result, school };
}

export async function listTimetables(schoolId: string): Promise<Timetable[]> {
  const snap = await getDocs(
    query(collection(db, "schools", schoolId, "timetables"), orderBy("createdAt", "desc"), limit(20))
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as Timetable));
}

export async function getTimetableEntries(
  schoolId: string,
  timetableId: string
): Promise<TimetableEntry[]> {
  const snap = await getDocs(
    collection(db, "schools", schoolId, "timetables", timetableId, "entries")
  );
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as TimetableEntry));
}

export async function lockEntry(
  schoolId: string,
  timetableId: string,
  entryId: string,
  locked: boolean
) {
  await setDoc(
    doc(db, "schools", schoolId, "timetables", timetableId, "entries", entryId),
    { locked, updatedAt: nowIso() },
    { merge: true }
  );
}

export async function getLatestTimetable(
  schoolId: string
): Promise<(Timetable & { conflicts?: unknown[]; score?: number; scheduledLessons?: number; requiredLessons?: number }) | null> {
  const list = await listTimetables(schoolId);
  return (list[0] as any) ?? null;
}
