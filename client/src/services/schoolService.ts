/**
 * School-related Firestore operations.
 * Authorization is enforced by Firestore rules; we still never trust client-supplied roles.
 */

import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  addDoc,
  deleteDoc,
  query,
  where,
  serverTimestamp,
  type DocumentData,
} from "firebase/firestore";
import { ref, uploadBytes, getDownloadURL } from "firebase/storage";
import { db, storage } from "@/lib/firebase";
import type {
  School,
  Department,
  Teacher,
  SchoolClass,
  LearningArea,
  Period,
  ScheduleSettings,
  Allocation,
  Availability,
  Plan,
  PaymentStatus,
  AccountStatus,
} from "@shared/types";

function nowIso() {
  return new Date().toISOString();
}

// ─── School ─────────────────────────────────────────────────────────────────

export async function createSchool(
  uid: string,
  data: {
    name: string;
    schoolType: string;
    academicYear: string;
    term: string;
    county: string;
    contactEmail: string;
    phone: string;
  }
): Promise<string> {
  const schoolRef = doc(collection(db, "schools"));
  const schoolId = schoolRef.id;
  const slug =
    data.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") +
    "-" +
    schoolId.slice(0, 6);

  const school: Omit<School, "id"> & { createdByUid: string } = {
    name: data.name.trim(),
    slug,
    createdByUid: uid,
    schoolType: data.schoolType,
    academicYear: data.academicYear,
    term: data.term,
    county: data.county,
    contactEmail: data.contactEmail.trim(),
    phone: data.phone.trim(),
    plan: "trial" as Plan,
    paymentStatus: "none" as PaymentStatus,
    accountStatus: "active" as AccountStatus,
    timezone: "Africa/Nairobi",
    trialStart: nowIso(),
    trialEnd: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString(), // 14-day trial
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };

  await setDoc(schoolRef, school);

  // Membership: creator becomes principal
  await setDoc(doc(db, "schools", schoolId, "users", uid), {
    schoolId,
    email: data.contactEmail.trim(),
    displayName: data.name.trim() + " Admin",
    role: "principal",
    active: true,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });

  // Link user profile → school
  await setDoc(
    doc(db, "userProfiles", uid),
    {
      schoolId,
      role: "principal",
      displayName: data.name.trim() + " Admin",
      email: data.contactEmail.trim(),
      updatedAt: serverTimestamp(),
    },
    { merge: true }
  );

  // Default schedule settings
  await setDoc(doc(db, "schools", schoolId, "settings", "schedule"), {
    schoolId,
    workingDays: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
    weekStart: "Monday",
    timezone: "Africa/Nairobi",
    updatedAt: nowIso(),
  } satisfies ScheduleSettings);

  return schoolId;
}

export async function getSchool(schoolId: string): Promise<School | null> {
  const snap = await getDoc(doc(db, "schools", schoolId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() } as School;
}

export async function updateSchool(
  schoolId: string,
  data: Partial<Pick<School, "name" | "schoolType" | "academicYear" | "term" | "county" | "contactEmail" | "phone" | "logoUrl">>
): Promise<void> {
  await updateDoc(doc(db, "schools", schoolId), {
    ...data,
    updatedAt: nowIso(),
  });
}

export async function uploadSchoolLogo(schoolId: string, file: File): Promise<string> {
  const ext = file.name.split(".").pop() || "png";
  const storageRef = ref(storage, `schools/${schoolId}/logo.${ext}`);
  await uploadBytes(storageRef, file, { contentType: file.type });
  const url = await getDownloadURL(storageRef);
  await updateSchool(schoolId, { logoUrl: url });
  return url;
}

// ─── Generic list / CRUD helpers ────────────────────────────────────────────

async function listSubcollection<T extends { id: string }>(
  schoolId: string,
  sub: string
): Promise<T[]> {
  const snap = await getDocs(collection(db, "schools", schoolId, sub));
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as T));
}

async function addSubDoc(schoolId: string, sub: string, data: DocumentData): Promise<string> {
  const ref = await addDoc(collection(db, "schools", schoolId, sub), {
    ...data,
    schoolId,
    createdAt: nowIso(),
    updatedAt: nowIso(),
  });
  return ref.id;
}

async function updateSubDoc(
  schoolId: string,
  sub: string,
  id: string,
  data: DocumentData
): Promise<void> {
  await updateDoc(doc(db, "schools", schoolId, sub, id), {
    ...data,
    updatedAt: nowIso(),
  });
}

async function softDeactivate(schoolId: string, sub: string, id: string): Promise<void> {
  await updateSubDoc(schoolId, sub, id, { active: false });
}

// ─── Departments ────────────────────────────────────────────────────────────

export const listDepartments = (schoolId: string) =>
  listSubcollection<Department>(schoolId, "departments");

export async function createDepartment(
  schoolId: string,
  data: { name: string; code?: string; hodUserId?: string }
) {
  return addSubDoc(schoolId, "departments", { ...data, active: true });
}

export const updateDepartment = (
  schoolId: string,
  id: string,
  data: Partial<Pick<Department, "name" | "code" | "hodUserId" | "active">>
) => updateSubDoc(schoolId, "departments", id, data);

export const deactivateDepartment = (schoolId: string, id: string) =>
  softDeactivate(schoolId, "departments", id);

// ─── Teachers ───────────────────────────────────────────────────────────────

export const listTeachers = (schoolId: string) =>
  listSubcollection<Teacher>(schoolId, "teachers");

export async function createTeacher(
  schoolId: string,
  data: {
    fullName: string;
    identifier: string;
    staffNumber?: string;
    departmentId?: string;
    email?: string;
    phone?: string;
  }
) {
  return addSubDoc(schoolId, "teachers", { ...data, active: true });
}

export const updateTeacher = (
  schoolId: string,
  id: string,
  data: Partial<Omit<Teacher, "id" | "schoolId" | "createdAt">>
) => updateSubDoc(schoolId, "teachers", id, data);

export const deactivateTeacher = (schoolId: string, id: string) =>
  softDeactivate(schoolId, "teachers", id);

// ─── Classes ────────────────────────────────────────────────────────────────

export const listClasses = (schoolId: string) =>
  listSubcollection<SchoolClass>(schoolId, "classes");

export async function createClass(
  schoolId: string,
  data: { name: string; grade?: string; stream?: string }
) {
  return addSubDoc(schoolId, "classes", { ...data, active: true });
}

export const updateClass = (
  schoolId: string,
  id: string,
  data: Partial<Pick<SchoolClass, "name" | "grade" | "stream" | "active">>
) => updateSubDoc(schoolId, "classes", id, data);

export const deactivateClass = (schoolId: string, id: string) =>
  softDeactivate(schoolId, "classes", id);

// ─── Learning Areas ─────────────────────────────────────────────────────────

export const listLearningAreas = (schoolId: string) =>
  listSubcollection<LearningArea>(schoolId, "learningAreas");

export async function createLearningArea(
  schoolId: string,
  data: {
    name: string;
    code: string;
    departmentId?: string;
    description?: string;
    requiredLessonsPerWeek: number;
    doubleLessons?: number;
  }
) {
  return addSubDoc(schoolId, "learningAreas", {
    ...data,
    doubleLessons: data.doubleLessons ?? 0,
    active: true,
  });
}

export const updateLearningArea = (
  schoolId: string,
  id: string,
  data: Partial<Omit<LearningArea, "id" | "schoolId" | "createdAt">>
) => updateSubDoc(schoolId, "learningAreas", id, data);

export const deactivateLearningArea = (schoolId: string, id: string) =>
  softDeactivate(schoolId, "learningAreas", id);

// ─── Periods ────────────────────────────────────────────────────────────────

export const listPeriods = (schoolId: string) =>
  listSubcollection<Period>(schoolId, "periods");

export async function createPeriod(
  schoolId: string,
  data: {
    periodNumber: number;
    label: string;
    startTime: string;
    endTime: string;
    kind: Period["kind"];
  }
) {
  return addSubDoc(schoolId, "periods", {
    ...data,
    displayOrder: data.periodNumber,
  });
}

export const updatePeriod = (
  schoolId: string,
  id: string,
  data: Partial<Omit<Period, "id" | "schoolId" | "createdAt">>
) => updateSubDoc(schoolId, "periods", id, data);

export async function deletePeriod(schoolId: string, id: string) {
  await deleteDoc(doc(db, "schools", schoolId, "periods", id));
}

// ─── Schedule settings ──────────────────────────────────────────────────────

export async function getScheduleSettings(schoolId: string): Promise<ScheduleSettings | null> {
  const snap = await getDoc(doc(db, "schools", schoolId, "settings", "schedule"));
  if (!snap.exists()) return null;
  return snap.data() as ScheduleSettings;
}

export async function updateScheduleSettings(
  schoolId: string,
  data: Partial<Pick<ScheduleSettings, "workingDays" | "weekStart" | "timezone">>
) {
  await setDoc(
    doc(db, "schools", schoolId, "settings", "schedule"),
    { schoolId, ...data, updatedAt: nowIso() },
    { merge: true }
  );
}

// ─── Allocations ────────────────────────────────────────────────────────────

export const listAllocations = (schoolId: string) =>
  listSubcollection<Allocation>(schoolId, "allocations");

export async function createAllocation(
  schoolId: string,
  data: {
    teacherId: string;
    classId: string;
    extraClassIds?: string[];
    learningAreaId: string;
    lessonsPerWeek: number;
    doubleLessons?: number;
    room?: string;
    parallelGroupId?: string;
    status?: Allocation["status"];
  }
) {
  return addSubDoc(schoolId, "allocations", {
    ...data,
    extraClassIds: data.extraClassIds ?? [],
    doubleLessons: data.doubleLessons ?? 0,
    room: data.room?.trim() || null,
    parallelGroupId: data.parallelGroupId?.trim() || null,
    status: data.status ?? "draft",
  });
}

export const updateAllocation = (
  schoolId: string,
  id: string,
  data: Partial<Omit<Allocation, "id" | "schoolId" | "createdAt">>
) => updateSubDoc(schoolId, "allocations", id, data);

// ─── Availability ───────────────────────────────────────────────────────────

export const listAvailability = (schoolId: string) =>
  listSubcollection<Availability>(schoolId, "availability");

export async function setAvailability(
  schoolId: string,
  data: {
    entityType: Availability["entityType"];
    entityId: string;
    dayName: string;
    periodNumber: number;
    state: Availability["state"];
  }
) {
  // Upsert by unique key: entityType+entityId+day+period
  const q = query(
    collection(db, "schools", schoolId, "availability"),
    where("entityType", "==", data.entityType),
    where("entityId", "==", data.entityId),
    where("dayName", "==", data.dayName),
    where("periodNumber", "==", data.periodNumber)
  );
  const existing = await getDocs(q);
  if (!existing.empty) {
    await updateDoc(existing.docs[0].ref, { state: data.state, updatedAt: nowIso() });
    return existing.docs[0].id;
  }
  return addSubDoc(schoolId, "availability", data);
}
