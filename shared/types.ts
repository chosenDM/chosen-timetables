/** Shared domain types for Chosen Time Tables */

export type Plan = "trial" | "monthly" | "lifetime";
export type PaymentStatus = "none" | "pending" | "paid" | "failed" | "expired";
export type AccountStatus = "active" | "suspended";
export type UserRole = "principal" | "timetable_admin" | "hod" | "teacher" | "viewer";
export type AllocationStatus = "draft" | "submitted" | "under_review" | "approved" | "rejected";
export type AvailabilityState = "available" | "preferred" | "unavailable";
export type PeriodKind = "lesson" | "assembly" | "short_break" | "long_break" | "lunch" | "games" | "other";
export type TimetableStatus = "draft" | "generated" | "published" | "archived";
export type EntityType = "teacher" | "class" | "learning_area";

export interface School {
  id: string;
  name: string;
  slug: string;
  schoolType: string;
  academicYear: string;
  term: string;
  county: string;
  contactEmail: string;
  phone: string;
  logoUrl?: string;
  plan: Plan;
  paymentStatus: PaymentStatus;
  accountStatus: AccountStatus;
  trialStart?: string;
  trialEnd?: string;
  suspensionReason?: string;
  suspendedBy?: string;
  suspendedAt?: string;
  activatedBy?: string;
  activatedAt?: string;
  timezone: string;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolUser {
  id: string; // Firebase Auth UID
  schoolId: string;
  email: string;
  displayName: string;
  role: UserRole;
  departmentId?: string; // for HOD
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Department {
  id: string;
  schoolId: string;
  name: string;
  code?: string;
  hodUserId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Teacher {
  id: string;
  schoolId: string;
  fullName: string;
  identifier: string;
  staffNumber?: string;
  departmentId?: string;
  email?: string;
  phone?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SchoolClass {
  id: string;
  schoolId: string;
  name: string;
  grade?: string;
  stream?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface LearningArea {
  id: string;
  schoolId: string;
  name: string;
  code: string;
  departmentId?: string;
  description?: string;
  requiredLessonsPerWeek: number;
  doubleLessons: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Period {
  id: string;
  schoolId: string;
  periodNumber: number;
  label: string;
  startTime: string;
  endTime: string;
  kind: PeriodKind;
  displayOrder: number;
  createdAt: string;
}

export interface ScheduleSettings {
  schoolId: string;
  workingDays: string[];
  weekStart: string;
  timezone: string;
  updatedAt: string;
}

export interface Allocation {
  id: string;
  schoolId: string;
  teacherId: string;
  classId: string;
  /** Other streams sharing this exact lesson (same subject + teacher + time) */
  extraClassIds?: string[];
  learningAreaId: string;
  lessonsPerWeek: number;
  doubleLessons: number;
  /** Room / lab e.g. Chem Lab, Comp Lab */
  room?: string;
  /**
   * Parallel elective block id/name. Allocations with the same value
   * are scheduled at the same day+period (e.g. Chem + Bio options).
   */
  parallelGroupId?: string;
  status: AllocationStatus;
  rejectionReason?: string;
  submittedBy?: string;
  reviewedBy?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Availability {
  id: string;
  schoolId: string;
  entityType: EntityType;
  entityId: string;
  dayName: string;
  periodNumber: number;
  state: AvailabilityState;
  createdAt: string;
}

export interface Timetable {
  id: string;
  schoolId: string;
  name: string;
  academicYear: string;
  term: string;
  status: TimetableStatus;
  version: number;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

/** Student membership line inside a joint class (no global student registry required) */
export interface JointClassMember {
  id: string;
  classId: string;
  fullName: string;
  admissionNo?: string;
}

/**
 * Joint class = students from several streams taking one subject together.
 * Complementary to ElectiveSession (timetable); does not create TT entries.
 */
export interface JointClass {
  id: string;
  schoolId: string;
  name: string;
  classLevel: string;
  learningAreaId: string;
  classIds: string[];
  members: JointClassMember[];
  /** Optional link to shared elective session — does not affect timetable display */
  electiveSessionId?: string | null;
  teacherId?: string | null;
  teacherCode?: string | null;
  room?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Shared joint elective lesson (multiple subjects, multiple streams, one slot) */
export interface ElectiveSession {
  id: string;
  schoolId: string;
  name: string;
  /** Participating stream/class ids */
  classIds: string[];
  /** Subject / learning area ids taught simultaneously */
  learningAreaIds: string[];
  /** Teacher codes only (not mapped 1:1 to subjects) */
  teacherCodes: string[];
  dayName: string;
  periodNumber: number;
  createdAt: string;
  updatedAt: string;
}

export interface TimetableEntry {
  id: string;
  schoolId: string;
  timetableId: string;
  dayName: string;
  periodNumber: number;
  classId: string;
  teacherId: string;
  learningAreaId: string;
  lessonType: "lesson" | "double";
  locked: boolean;
  room?: string;
  jointGroupId?: string;
  parallelGroupId?: string;
  createdAt: string;
}

export interface TimetableVersion {
  id: string;
  schoolId: string;
  timetableId: string;
  versionNumber: number;
  snapshot: TimetableEntry[];
  reason?: string;
  createdBy: string;
  createdAt: string;
  status: "active" | "archived";
}

export interface AuditLog {
  id: string;
  schoolId?: string;
  actorId: string;
  action: string;
  entityType?: string;
  entityId?: string;
  details?: Record<string, unknown>;
  createdAt: string;
}

// Re-export engine types for convenience
export type {
  ScheduleDay,
  EnginePeriod,
  EngineTeacher,
  EngineClass,
  EngineArea,
  EngineAllocation,
  EngineAvailability,
  GeneratedEntry,
  EngineInput,
  SchedulingConflict,
  EngineResult,
} from "./timetable-engine";
