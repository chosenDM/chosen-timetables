import { boolean, int, json, mysqlEnum, mysqlTable, text, timestamp, varchar } from "drizzle-orm/mysql-core";

export const users = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  openId: varchar("openId", { length: 64 }).notNull().unique(),
  name: text("name"),
  email: varchar("email", { length: 320 }),
  loginMethod: varchar("loginMethod", { length: 64 }),
  role: mysqlEnum("role", ["user", "admin"]).default("user").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  lastSignedIn: timestamp("lastSignedIn").defaultNow().notNull(),
});

export const schools = mysqlTable("schools", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 180 }).notNull(),
  slug: varchar("slug", { length: 180 }).notNull().unique(),
  schoolType: varchar("schoolType", { length: 80 }).default("Secondary").notNull(),
  academicYear: varchar("academicYear", { length: 20 }).default("2026").notNull(),
  term: varchar("term", { length: 40 }).default("Term 3").notNull(),
  county: varchar("county", { length: 80 }),
  contactEmail: varchar("contactEmail", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  logoUrl: text("logoUrl"),
  plan: mysqlEnum("plan", ["trial", "monthly", "lifetime"]).default("trial").notNull(),
  paymentStatus: mysqlEnum("paymentStatus", ["none", "pending", "paid", "failed", "expired"]).default("none").notNull(),
  accountStatus: mysqlEnum("accountStatus", ["active", "suspended"]).default("active").notNull(),
  suspensionReason: text("suspensionReason"),
  suspendedBy: int("suspendedBy"),
  suspendedAt: timestamp("suspendedAt"),
  activatedBy: int("activatedBy"),
  activatedAt: timestamp("activatedAt"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const schoolUsers = mysqlTable("schoolUsers", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull(),
  userId: int("userId").notNull(),
  role: mysqlEnum("role", ["principal", "timetable_admin", "hod"]).default("timetable_admin").notNull(),
  departmentId: int("departmentId"),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const departments = mysqlTable("departments", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  description: text("description"),
  hodUserId: int("hodUserId"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const teachers = mysqlTable("teachers", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull(),
  fullName: varchar("fullName", { length: 160 }).notNull(),
  identifier: varchar("identifier", { length: 20 }).notNull(),
  staffNumber: varchar("staffNumber", { length: 40 }),
  departmentId: int("departmentId"),
  email: varchar("email", { length: 320 }),
  phone: varchar("phone", { length: 40 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const classes = mysqlTable("classes", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull(),
  name: varchar("name", { length: 80 }).notNull(),
  grade: varchar("grade", { length: 40 }),
  stream: varchar("stream", { length: 40 }),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const learningAreas = mysqlTable("learningAreas", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull(),
  name: varchar("name", { length: 140 }).notNull(),
  code: varchar("code", { length: 20 }).notNull(),
  departmentId: int("departmentId"),
  description: text("description"),
  requiredLessonsPerWeek: int("requiredLessonsPerWeek").default(0).notNull(),
  doubleLessons: int("doubleLessons").default(0).notNull(),
  active: boolean("active").default(true).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const periods = mysqlTable("periods", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull(),
  periodNumber: int("periodNumber").notNull(),
  label: varchar("label", { length: 80 }).notNull(),
  startTime: varchar("startTime", { length: 10 }).notNull(),
  endTime: varchar("endTime", { length: 10 }).notNull(),
  kind: mysqlEnum("kind", ["lesson", "assembly", "long_break", "short_break", "lunch", "games", "other"]).default("lesson").notNull(),
  displayOrder: int("displayOrder").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const scheduleSettings = mysqlTable("scheduleSettings", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull().unique(),
  workingDays: json("workingDays").notNull(),
  weekStart: varchar("weekStart", { length: 20 }).default("Monday").notNull(),
  timezone: varchar("timezone", { length: 60 }).default("Africa/Nairobi").notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const allocations = mysqlTable("allocations", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull(),
  teacherId: int("teacherId").notNull(),
  classId: int("classId").notNull(),
  learningAreaId: int("learningAreaId").notNull(),
  lessonsPerWeek: int("lessonsPerWeek").notNull(),
  doubleLessons: int("doubleLessons").default(0).notNull(),
  status: mysqlEnum("status", ["draft", "submitted", "under_review", "approved", "rejected"]).default("draft").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const availability = mysqlTable("availability", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull(),
  entityType: mysqlEnum("entityType", ["teacher", "class", "learning_area"]).notNull(),
  entityId: int("entityId").notNull(),
  dayName: varchar("dayName", { length: 20 }).notNull(),
  periodNumber: int("periodNumber").notNull(),
  state: mysqlEnum("state", ["available", "preferred", "unavailable"]).default("available").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const timetables = mysqlTable("timetables", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull(),
  name: varchar("name", { length: 160 }).notNull(),
  academicYear: varchar("academicYear", { length: 20 }).notNull(),
  term: varchar("term", { length: 40 }).notNull(),
  status: mysqlEnum("status", ["draft", "generated", "archived"]).default("draft").notNull(),
  version: int("version").default(1).notNull(),
  createdBy: int("createdBy").notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
});

export const timetableEntries = mysqlTable("timetableEntries", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId").notNull(),
  timetableId: int("timetableId").notNull(),
  dayName: varchar("dayName", { length: 20 }).notNull(),
  periodNumber: int("periodNumber").notNull(),
  classId: int("classId").notNull(),
  teacherId: int("teacherId").notNull(),
  learningAreaId: int("learningAreaId").notNull(),
  lessonType: mysqlEnum("lessonType", ["lesson", "double"]).default("lesson").notNull(),
  locked: boolean("locked").default(false).notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const auditLogs = mysqlTable("auditLogs", {
  id: int("id").autoincrement().primaryKey(),
  schoolId: int("schoolId"),
  userId: int("userId").notNull(),
  action: varchar("action", { length: 120 }).notNull(),
  recordType: varchar("recordType", { length: 80 }),
  recordId: int("recordId"),
  metadata: json("metadata"),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export const platformSettings = mysqlTable("platformSettings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 120 }).notNull().unique(),
  value: text("value"),
  isSecret: boolean("isSecret").default(false).notNull(),
  updatedBy: int("updatedBy"),
  updatedAt: timestamp("updatedAt").defaultNow().onUpdateNow().notNull(),
  createdAt: timestamp("createdAt").defaultNow().notNull(),
});

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type School = typeof schools.$inferSelect;
export type SchoolUser = typeof schoolUsers.$inferSelect;
export type Department = typeof departments.$inferSelect;
export type Teacher = typeof teachers.$inferSelect;
export type SchoolClass = typeof classes.$inferSelect;
export type LearningArea = typeof learningAreas.$inferSelect;
export type Period = typeof periods.$inferSelect;
export type Allocation = typeof allocations.$inferSelect;
export type Timetable = typeof timetables.$inferSelect;
export type TimetableEntry = typeof timetableEntries.$inferSelect;
