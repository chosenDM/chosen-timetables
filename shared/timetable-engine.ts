/**
 * Chosen Time Tables — constraint engine
 * Hard constraints + constrained-first ordering + scoring + backtracking.
 */

export type ScheduleDay = string;
export type AvailabilityState = "available" | "preferred" | "unavailable";
export type EnginePeriod = { periodNumber: number; kind: string; startTime: string; endTime: string; displayOrder: number };
export type EngineTeacher = { id: string; fullName: string; identifier: string };
export type EngineClass = { id: string; name: string };
export type EngineArea = { id: string; name: string; code: string };
export type EngineAllocation = {
  id: string;
  teacherId: string;
  classId: string;
  /** Additional classes sharing the same lesson (joint streams) */
  extraClassIds?: string[];
  learningAreaId: string;
  lessonsPerWeek: number;
  doubleLessons: number;
  status: string;
  room?: string;
  /** Same id → co-scheduled (parallel electives e.g. Chem+Bio) */
  parallelGroupId?: string;
};
export type EngineAvailability = {
  entityType: "teacher" | "class" | "learning_area";
  entityId: string;
  dayName: string;
  periodNumber: number;
  state: AvailabilityState;
};
export type GeneratedEntry = {
  dayName: string;
  periodNumber: number;
  classId: string;
  teacherId: string;
  learningAreaId: string;
  lessonType: "lesson" | "double";
  locked: boolean;
  jointGroupId?: string;
  room?: string;
  parallelGroupId?: string;
};
export type EngineInput = {
  days: ScheduleDay[];
  periods: EnginePeriod[];
  teachers: EngineTeacher[];
  classes: EngineClass[];
  learningAreas: EngineArea[];
  allocations: EngineAllocation[];
  availability: EngineAvailability[];
  lockedEntries?: GeneratedEntry[];
};
export type SchedulingConflict = {
  allocationId: string;
  classId: string;
  teacherId: string;
  learningAreaId: string;
  message: string;
  reasons: string[];
  suggestions: string[];
  requiredLessons?: number;
  scheduledLessons?: number;
};
export type EngineResult = {
  entries: GeneratedEntry[];
  conflicts: SchedulingConflict[];
  scheduledLessons: number;
  requiredLessons: number;
  score: number;
};

type Unit = {
  id: string;
  allocation: EngineAllocation;
  /** Parallel elective siblings (same slot, different subjects/teachers) */
  siblings: EngineAllocation[];
  isDouble: boolean;
};
type Slot = { dayName: string; periodNumber: number };

const key = (d: string, p: number) => `${d}::${p}`;

/** Max backtrack node expansions — prevents runaway on huge instances */
const MAX_NODES = 25000;

export function generateTimetable(input: EngineInput): EngineResult {
  const lessonPeriods = input.periods
    .filter((p) => p.kind === "lesson")
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const availability = new Map<string, AvailabilityState>();
  for (const item of input.availability) {
    availability.set(`${item.entityType}:${item.entityId}:${key(item.dayName, item.periodNumber)}`, item.state);
  }
  const periodMap = new Map(input.periods.map((p) => [p.periodNumber, p]));

  const classBusy = new Set<string>();
  const teacherBusy = new Set<string>();
  const entries: GeneratedEntry[] = [];
  const subjectDayCounts = new Map<string, number>();
  const teacherDayCounts = new Map<string, number>();

  // Place locked entries first
  for (const locked of input.lockedEntries ?? []) {
    if (!locked.locked) continue;
    classBusy.add(`${locked.classId}:${key(locked.dayName, locked.periodNumber)}`);
    // Shared electives (jointGroupId): lock the class slot only — do not busy a single
    // placeholder teacher across every stream (avoids false multi-stream conflicts).
    if (!locked.jointGroupId) {
      teacherBusy.add(`${locked.teacherId}:${key(locked.dayName, locked.periodNumber)}`);
    }
    entries.push({ ...locked, locked: true });
  }

  const approved = input.allocations.filter(
    (a) => a.status === "approved" || a.status === "submitted"
  );

  // Build lesson counts per allocation
  const lessonUnits: { allocation: EngineAllocation; isDouble: boolean; idx: number }[] = [];
  for (const allocation of approved) {
    const lockedCount = (input.lockedEntries ?? []).filter(
      (e) =>
        e.locked &&
        e.classId === allocation.classId &&
        e.teacherId === allocation.teacherId &&
        e.learningAreaId === allocation.learningAreaId
    ).length;
    let remaining = Math.max(0, allocation.lessonsPerWeek - lockedCount);
    const doubles = Math.min(Math.floor(remaining / 2), allocation.doubleLessons);
    let idx = 0;
    for (let i = 0; i < doubles; i++) {
      lessonUnits.push({ allocation, isDouble: true, idx: idx++ });
      remaining -= 2;
    }
    for (let i = 0; i < remaining; i++) {
      lessonUnits.push({ allocation, isDouble: false, idx: idx++ });
    }
  }

  // Bundle parallel elective groups: same parallelGroupId + same lesson index → one unit
  const units: Unit[] = [];
  const used = new Set<string>();
  for (const lu of lessonUnits) {
    const uid = `${lu.allocation.id}:${lu.idx}`;
    if (used.has(uid)) continue;
    const gid = (lu.allocation.parallelGroupId || "").trim();
    if (gid) {
      const siblings = lessonUnits.filter(
        (o) =>
          (o.allocation.parallelGroupId || "").trim() === gid &&
          o.idx === lu.idx &&
          o.allocation.id !== lu.allocation.id &&
          o.isDouble === lu.isDouble
      );
      for (const s of siblings) used.add(`${s.allocation.id}:${s.idx}`);
      used.add(uid);
      units.push({
        id: `pg:${gid}:${lu.idx}:${lu.isDouble ? "d" : "s"}`,
        allocation: lu.allocation,
        siblings: siblings.map((s) => s.allocation),
        isDouble: lu.isDouble,
      });
    } else {
      used.add(uid);
      units.push({
        id: `${lu.allocation.id}-${lu.isDouble ? "d" : "s"}${lu.idx}`,
        allocation: lu.allocation,
        siblings: [],
        isDouble: lu.isDouble,
      });
    }
  }

  const isUnavail = (type: EngineAvailability["entityType"], id: string, slot: Slot) =>
    availability.get(`${type}:${id}:${key(slot.dayName, slot.periodNumber)}`) === "unavailable";
  const isPref = (type: EngineAvailability["entityType"], id: string, slot: Slot) =>
    availability.get(`${type}:${id}:${key(slot.dayName, slot.periodNumber)}`) === "preferred";
  const consecOk = (n: number) => {
    const a = periodMap.get(n);
    const b = periodMap.get(n + 1);
    return !!(a && b && a.kind === "lesson" && b.kind === "lesson" && b.displayOrder === a.displayOrder + 1);
  };

  const allMembers = (unit: Unit) => [unit.allocation, ...(unit.siblings || [])];

  const canPlace = (unit: Unit, slot: Slot) => {
    const members = allMembers(unit);
    const reasons: string[] = [];
    const first = periodMap.get(slot.periodNumber);
    if (!first || first.kind !== "lesson") reasons.push("the selected period is not a lesson block");
    if (unit.isDouble && !consecOk(slot.periodNumber))
      reasons.push("a double lesson needs two consecutive lesson periods without a break");
    const slots = unit.isDouble
      ? [slot, { dayName: slot.dayName, periodNumber: slot.periodNumber + 1 }]
      : [slot];
    for (const member of members) {
      for (const s of slots) {
        const classIds = [member.classId, ...(member.extraClassIds || [])];
        for (const cid of classIds) {
          if (classBusy.has(`${cid}:${key(s.dayName, s.periodNumber)}`))
            reasons.push("a class in this joint group is already occupied");
        }
        if (teacherBusy.has(`${member.teacherId}:${key(s.dayName, s.periodNumber)}`))
          reasons.push("the teacher is already teaching another class");
        if (isUnavail("teacher", member.teacherId, s)) reasons.push("the teacher is unavailable");
        if (isUnavail("class", member.classId, s)) reasons.push("the class is unavailable");
        if (isUnavail("learning_area", member.learningAreaId, s))
          reasons.push("the learning area is unavailable");
      }
    }
    let score = 0;
    const a = unit.allocation;
    const allClassIds = [a.classId, ...(a.extraClassIds || [])];
    const dayName0 = slots[0].dayName;
    let daysUsed = 0;
    for (const d of input.days) {
      const load = allClassIds.reduce(
        (n, cid) => n + (subjectDayCounts.get(`${cid}:${a.learningAreaId}:${d}`) ?? 0),
        0
      );
      if (load > 0) daysUsed++;
    }
    for (const s of slots) {
      if (isPref("teacher", a.teacherId, s)) score += 5;
      if (isPref("class", a.classId, s)) score += 2;
      if (isPref("learning_area", a.learningAreaId, s)) score += 3;
      for (const cid of allClassIds) {
        const dayLoad = subjectDayCounts.get(`${cid}:${a.learningAreaId}:${s.dayName}`) ?? 0;
        score -= dayLoad * (unit.isDouble ? 15 : 70);
      }
      score -= (teacherDayCounts.get(`${a.teacherId}:${s.dayName}`) ?? 0) * 3;
    }
    for (const cid of allClassIds) {
      const dayLoad = subjectDayCounts.get(`${cid}:${a.learningAreaId}:${dayName0}`) ?? 0;
      if (dayLoad === 0) {
        score += 55;
        if (daysUsed < Math.min(input.days.length, a.lessonsPerWeek)) score += 20;
      } else if (dayLoad >= 1 && !unit.isDouble) {
        score -= 35;
      }
    }
    return { ok: reasons.length === 0, reasons: Array.from(new Set(reasons)), score };
  };

  const place = (unit: Unit, slot: Slot) => {
    const slots = unit.isDouble
      ? [slot, { dayName: slot.dayName, periodNumber: slot.periodNumber + 1 }]
      : [slot];
    const placed: GeneratedEntry[] = [];
    for (const member of allMembers(unit)) {
      const classIds = [member.classId, ...(member.extraClassIds || [])];
      const jointGroupId =
        classIds.length > 1 || unit.siblings.length
          ? member.parallelGroupId || member.id
          : undefined;
      for (const s of slots) {
        teacherBusy.add(`${member.teacherId}:${key(s.dayName, s.periodNumber)}`);
        for (const cid of classIds) {
          classBusy.add(`${cid}:${key(s.dayName, s.periodNumber)}`);
          const entry: GeneratedEntry = {
            dayName: s.dayName,
            periodNumber: s.periodNumber,
            classId: cid,
            teacherId: member.teacherId,
            learningAreaId: member.learningAreaId,
            lessonType: unit.isDouble ? "double" : "lesson",
            locked: false,
            jointGroupId,
            room: member.room,
            parallelGroupId: member.parallelGroupId,
          };
          entries.push(entry);
          placed.push(entry);
          subjectDayCounts.set(
            `${cid}:${member.learningAreaId}:${s.dayName}`,
            (subjectDayCounts.get(`${cid}:${member.learningAreaId}:${s.dayName}`) ?? 0) + 1
          );
        }
        teacherDayCounts.set(
          `${member.teacherId}:${s.dayName}`,
          (teacherDayCounts.get(`${member.teacherId}:${s.dayName}`) ?? 0) + 1
        );
      }
    }
    return placed;
  };

  const unplace = (unit: Unit, placed: GeneratedEntry[]) => {
    for (const e of placed) {
      classBusy.delete(`${e.classId}:${key(e.dayName, e.periodNumber)}`);
      teacherBusy.delete(`${e.teacherId}:${key(e.dayName, e.periodNumber)}`);
      const si = entries.indexOf(e);
      if (si >= 0) entries.splice(si, 1);
      const sk = `${e.classId}:${e.learningAreaId}:${e.dayName}`;
      subjectDayCounts.set(sk, Math.max(0, (subjectDayCounts.get(sk) ?? 1) - 1));
      const tk = `${e.teacherId}:${e.dayName}`;
      teacherDayCounts.set(tk, Math.max(0, (teacherDayCounts.get(tk) ?? 1) - 1));
    }
  };

  const candidatesFor = (unit: Unit) => {
    const candidates: { slot: Slot; score: number }[] = [];
    for (const day of input.days) {
      for (const p of lessonPeriods) {
        const r = canPlace(unit, { dayName: day, periodNumber: p.periodNumber });
        if (r.ok) candidates.push({ slot: { dayName: day, periodNumber: p.periodNumber }, score: r.score });
      }
    }
    // Prefer higher score; among equals, days that still have 0 for this subject
    candidates.sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      const aIds = [unit.allocation.classId, ...(unit.allocation.extraClassIds || [])];
      const emptyA = aIds.every(
        (cid) =>
          (subjectDayCounts.get(
            `${cid}:${unit.allocation.learningAreaId}:${a.slot.dayName}`
          ) ?? 0) === 0
      );
      const emptyB = aIds.every(
        (cid) =>
          (subjectDayCounts.get(
            `${cid}:${unit.allocation.learningAreaId}:${b.slot.dayName}`
          ) ?? 0) === 0
      );
      return Number(emptyB) - Number(emptyA);
    });
    return candidates;
  };

  const candidateCount = (unit: Unit) => candidatesFor(unit).length;

  // Constrained-first: doubles, then fewest candidates
  units.sort(
    (a, b) => Number(b.isDouble) - Number(a.isDouble) || candidateCount(a) - candidateCount(b)
  );

  // ── Backtracking search ──────────────────────────────────────────────────
  let nodes = 0;
  const assignment: (Slot | null)[] = new Array(units.length).fill(null);
  const placedStack: GeneratedEntry[][] = new Array(units.length).fill(null);

  const search = (index: number): boolean => {
    if (index >= units.length) return true;
    if (++nodes > MAX_NODES) return false;

    const unit = units[index];
    const candidates = candidatesFor(unit);

    // Limited branching: try top candidates first (still backtracks)
    const limit = Math.min(candidates.length, unit.isDouble ? 12 : 16);
    for (let i = 0; i < limit; i++) {
      const { slot } = candidates[i];
      const placed = place(unit, slot);
      assignment[index] = slot;
      placedStack[index] = placed;
      if (search(index + 1)) return true;
      unplace(unit, placed);
      assignment[index] = null;
      placedStack[index] = null as unknown as GeneratedEntry[];
    }

    // If no candidate works even with backtracking, leave unplaced and continue
    // so other units can still be scheduled (partial solutions)
    if (candidates.length === 0 || limit === 0) {
      return search(index + 1);
    }
    // Exhausted candidates for this unit — try skipping (partial) rather than fail all
    return search(index + 1);
  };

  search(0);

  // Build conflicts for units that were not placed
  const conflicts: SchedulingConflict[] = [];
  const placedUnitIds = new Set<string>();
  // Reconstruct which units got entries from current entries (non-locked)
  for (const unit of units) {
    const scheduledForAlloc = entries.filter(
      (e) =>
        !e.locked &&
        e.classId === unit.allocation.classId &&
        e.teacherId === unit.allocation.teacherId &&
        e.learningAreaId === unit.allocation.learningAreaId
    ).length;
    // Count how many lesson-slots this unit needs
    const need = unit.isDouble ? 2 : 1;
    // We track per-unit via assignment
  }

  for (let i = 0; i < units.length; i++) {
    if (assignment[i] != null) continue;
    const unit = units[i];
    const reasons = Array.from(
      new Set(
        input.days.flatMap((day) =>
          lessonPeriods.flatMap(
            (p) => canPlace(unit, { dayName: day, periodNumber: p.periodNumber }).reasons
          )
        )
      )
    );
    const scheduledForAlloc = entries.filter(
      (e) =>
        e.classId === unit.allocation.classId &&
        e.teacherId === unit.allocation.teacherId &&
        e.learningAreaId === unit.allocation.learningAreaId
    ).length;
    const reasonText = reasons.join(" ").toLowerCase();
    const tips: string[] = [];
    if (reasonText.includes("unavailable") || reasonText.includes("availability")) {
      tips.push(
        "STEP 1: Open the left menu and click Availability."
      );
      tips.push(
        "STEP 2: Find this teacher and tick more periods as Available (green)."
      );
      tips.push(
        "STEP 3: Click Save, go back to Timetables, click Generate again."
      );
    }
    if (reasonText.includes("already teaching") || reasonText.includes("occupied")) {
      tips.push(
        "STEP 1: Open Allocations and find this teacher."
      );
      tips.push(
        "STEP 2: Either reduce Lessons per week, or give some lessons to another teacher."
      );
      tips.push(
        "STEP 3: Approve the change, then Timetables → Generate again."
      );
    }
    if (reasonText.includes("double")) {
      tips.push(
        "STEP 1: Open Periods and check that two lesson periods sit next to each other (no break in between)."
      );
      tips.push(
        "STEP 2: Or open Allocations and set Double lessons to a lower number."
      );
      tips.push(
        "STEP 3: Timetables → Generate again."
      );
    }
    if (tips.length === 0) {
      tips.push(
        "STEP 1: Open Allocations. Check that Lessons per week is not higher than free periods for this teacher."
      );
      tips.push(
        "STEP 2: Open Availability and allow more free periods for this teacher."
      );
      tips.push(
        "STEP 3: Timetables → Generate again."
      );
    }

    const teacherName =
      input.teachers.find((t) => t.id === unit.allocation.teacherId)?.fullName ||
      unit.allocation.teacherId;
    const className =
      input.classes.find((c) => c.id === unit.allocation.classId)?.name ||
      unit.allocation.classId;
    const areaName =
      input.learningAreas.find((a) => a.id === unit.allocation.learningAreaId)?.code ||
      input.learningAreas.find((a) => a.id === unit.allocation.learningAreaId)?.name ||
      unit.allocation.learningAreaId;

    const teacherAvailSlots = input.days.reduce((n, day) => {
      return (
        n +
        lessonPeriods.filter((p) => {
          const st = availability.get(
            `teacher:${unit.allocation.teacherId}:${key(day, p.periodNumber)}`
          );
          return st !== "unavailable";
        }).length
      );
    }, 0);
    const teacherRequired = approved
      .filter((a) => a.teacherId === unit.allocation.teacherId)
      .reduce((n, a) => n + a.lessonsPerWeek, 0);

    let title = "Unscheduled lesson";
    if (unit.isDouble) title = "Double-lesson conflict";
    else if (reasonText.includes("unavailable")) title = "Teacher availability conflict";
    else if (reasonText.includes("already teaching")) title = "Teacher scheduling conflict";
    else if (reasonText.includes("occupied")) title = "Class timetable conflict";
    else if (teacherRequired > teacherAvailSlots) title = "Teacher workload conflict";

    const detailReasons = [...reasons];
    if (teacherRequired > teacherAvailSlots) {
      detailReasons.push(
        `Teacher needs about ${teacherRequired} periods/week but only has ~${teacherAvailSlots} free periods (shortage ${teacherRequired - teacherAvailSlots}).`
      );
    }
    if (!detailReasons.length)
      detailReasons.push("No free period left that matches class, teacher and subject rules.");

    conflicts.push({
      allocationId: unit.allocation.id,
      classId: unit.allocation.classId,
      teacherId: unit.allocation.teacherId,
      learningAreaId: unit.allocation.learningAreaId,
      message: `${title}: ${areaName} · ${className} · ${teacherName}${
        unit.isDouble ? " (double lesson)" : ""
      }.`,
      reasons: Array.from(new Set(detailReasons)),
      suggestions: tips,
      requiredLessons: unit.allocation.lessonsPerWeek,
      scheduledLessons: scheduledForAlloc,
    });
  }

  // Deduplicate conflicts by allocation (multiple units per allocation)
  const seen = new Set<string>();
  const deduped: SchedulingConflict[] = [];
  for (const c of conflicts) {
    const k = `${c.allocationId}:${c.message}`;
    if (seen.has(k)) continue;
    seen.add(k);
    deduped.push(c);
  }

  const requiredLessons =
    units.reduce((t, u) => t + (u.isDouble ? 2 : 1), 0) +
    (input.lockedEntries ?? []).filter((e) => e.locked).length;

  return {
    entries,
    conflicts: deduped,
    scheduledLessons: entries.length,
    requiredLessons,
    score: requiredLessons ? Math.round((entries.length / requiredLessons) * 100) : 100,
  };
}


/** Pre-generation checks: workload vs availability (does not change data) */
export type ReadinessIssue = {
  category: string;
  summary: string;
  details: string;
  tips: string[];
};

export function validateTimetableReadiness(input: EngineInput): ReadinessIssue[] {
  const issues: ReadinessIssue[] = [];
  const lessonPeriods = input.periods
    .filter((p) => p.kind === "lesson")
    .sort((a, b) => a.displayOrder - b.displayOrder);
  const approved = input.allocations.filter(
    (a) => a.status === "approved" || a.status === "submitted"
  );
  if (!approved.length) {
    issues.push({
      category: "Allocations",
      summary: "No approved allocations",
      details: "Timetable generation needs at least one approved allocation.",
      tips: [
        "STEP 1: Open Allocations.",
        "STEP 2: Add teacher–class–subject rows and set Lessons per week.",
        "STEP 3: Approve them, then return here and Generate.",
      ],
    });
    return issues;
  }

  const avail = new Map<string, string>();
  for (const item of input.availability) {
    avail.set(
      `${item.entityType}:${item.entityId}:${item.dayName}::${item.periodNumber}`,
      item.state
    );
  }
  const isUnavail = (entityType: string, entityId: string, day: string, p: number) =>
    avail.get(`${entityType}:${entityId}:${day}::${p}`) === "unavailable";

  const byTeacher = new Map<string, number>();
  for (const a of approved) {
    byTeacher.set(a.teacherId, (byTeacher.get(a.teacherId) ?? 0) + a.lessonsPerWeek);
  }
  for (const [tid, required] of byTeacher) {
    let available = 0;
    for (const day of input.days) {
      for (const p of lessonPeriods) {
        if (!isUnavail("teacher", tid, day, p.periodNumber)) available++;
      }
    }
    if (required > available) {
      const t = input.teachers.find((x) => x.id === tid);
      const name = t?.fullName || tid;
      const code = t?.identifier || "";
      issues.push({
        category: "Teacher workload",
        summary: `${name}${code ? ` (${code})` : ""} is short by ${required - available} period(s)`,
        details: `Required teaching periods: ${required}. Available periods: ${available}. Shortage: ${required - available}.`,
        tips: [
          "STEP 1: Open Availability and tick more periods for this teacher.",
          "STEP 2: Or open Allocations and move some lessons to another teacher.",
          "STEP 3: Generate again after saving.",
        ],
      });
    }
  }

  const byClass = new Map<string, number>();
  for (const a of approved) {
    byClass.set(a.classId, (byClass.get(a.classId) ?? 0) + a.lessonsPerWeek);
  }
  const classSlots = input.days.length * lessonPeriods.length;
  for (const [cid, required] of byClass) {
    if (required > classSlots) {
      const cname = input.classes.find((c) => c.id === cid)?.name || cid;
      issues.push({
        category: "Class capacity",
        summary: `${cname} needs ${required} lessons but only has ${classSlots} periods/week`,
        details: "Too many lessons assigned to this class for the number of lesson periods.",
        tips: [
          "STEP 1: Open Allocations and reduce Lessons per week for some subjects.",
          "STEP 2: Or open Periods and add more lesson periods (not breaks).",
          "STEP 3: Generate again.",
        ],
      });
    }
  }

  const hasConsec = lessonPeriods.some((p) => {
    const next = lessonPeriods.find((x) => x.periodNumber === p.periodNumber + 1);
    return !!(next && next.displayOrder === p.displayOrder + 1);
  });
  const wantsDouble = approved.some((a) => a.doubleLessons > 0);
  if (wantsDouble && !hasConsec) {
    issues.push({
      category: "Double lessons",
      summary: "Double lessons are requested but no two consecutive lesson periods exist",
      details: "A double lesson needs two lesson periods next to each other with no break between.",
      tips: [
        "STEP 1: Open Periods and place two lesson periods back-to-back.",
        "STEP 2: Or set Double lessons to 0 on allocations that do not need them.",
      ],
    });
  }

  return issues;
}
