import { describe, expect, it } from "vitest";
import { generateTimetable, type EngineInput } from "./timetable-engine";

const baseInput = (): EngineInput => ({
  days: ["Monday", "Tuesday"],
  periods: [
    { periodNumber: 1, kind: "lesson", startTime: "08:00", endTime: "08:40", displayOrder: 1 },
    { periodNumber: 2, kind: "long_break", startTime: "08:40", endTime: "09:00", displayOrder: 2 },
    { periodNumber: 3, kind: "lesson", startTime: "09:00", endTime: "09:40", displayOrder: 3 },
    { periodNumber: 4, kind: "lesson", startTime: "09:40", endTime: "10:20", displayOrder: 4 },
  ],
  teachers: [{ id: "1", fullName: "Teacher One", identifier: "T1" }, { id: "2", fullName: "Teacher Two", identifier: "T2" }],
  classes: [{ id: "1", name: "Grade 8A" }, { id: "2", name: "Grade 8B" }],
  learningAreas: [{ id: "1", name: "Mathematics", code: "MATH" }, { id: "2", name: "English", code: "ENG" }],
  allocations: [{ id: "1", teacherId: "1", classId: "1", learningAreaId: "1", lessonsPerWeek: 2, doubleLessons: 1, status: "approved" }],
  availability: [],
});

describe("generateTimetable", () => {
  it("keeps a double lesson consecutive and never crosses a break", () => {
    const result = generateTimetable(baseInput());
    expect(result.conflicts).toHaveLength(0);
    expect(result.entries).toHaveLength(2);
    expect(result.entries[0].dayName).toBe(result.entries[1].dayName);
    expect(Math.abs(result.entries[0].periodNumber - result.entries[1].periodNumber)).toBe(1);
    expect(result.entries.every(e => e.lessonType === "double")).toBe(true);
  });
  it("respects teacher unavailable periods", () => {
    const input = baseInput();
    input.allocations[0].lessonsPerWeek = 1;
    input.allocations[0].doubleLessons = 0;
    input.availability = [{ entityType: "teacher", entityId: "1", dayName: "Monday", periodNumber: 1, state: "unavailable" }];
    const result = generateTimetable(input);
    expect(result.conflicts).toHaveLength(0);
    expect(!(result.entries[0].dayName === "Monday" && result.entries[0].periodNumber === 1)).toBe(true);
  });
  it("reports unresolved conflicts", () => {
    const input = baseInput();
    input.days = ["Monday"];
    input.periods = [{ periodNumber: 1, kind: "lesson", startTime: "08:00", endTime: "08:40", displayOrder: 1 }];
    input.availability = [{ entityType: "teacher", entityId: "1", dayName: "Monday", periodNumber: 1, state: "unavailable" }];
    const result = generateTimetable(input);
    expect(result.scheduledLessons).toBe(0);
    expect(result.conflicts[0]?.reasons.length).toBeGreaterThan(0);
  });
  it("preserves locked entries", () => {
    const input = baseInput();
    input.allocations[0].lessonsPerWeek = 2;
    input.allocations[0].doubleLessons = 0;
    input.lockedEntries = [{ dayName: "Monday", periodNumber: 1, classId: "1", teacherId: "1", learningAreaId: "1", lessonType: "lesson", locked: true }];
    const result = generateTimetable(input);
    expect(result.entries.filter(e => e.locked).length).toBe(1);
  });
});

  it("reconciles conflicts via backtracking when first placement blocks later units", () => {
    // Two singles for same teacher competing for scarce slots — backtracking should fit both if possible
    const input = baseInput();
    input.days = ["Monday"];
    input.periods = [
      { periodNumber: 1, kind: "lesson", startTime: "08:00", endTime: "08:40", displayOrder: 1 },
      { periodNumber: 2, kind: "lesson", startTime: "08:40", endTime: "09:20", displayOrder: 2 },
    ];
    input.allocations = [
      { id: "1", teacherId: "1", classId: "1", learningAreaId: "1", lessonsPerWeek: 1, doubleLessons: 0, status: "approved" },
      { id: "2", teacherId: "1", classId: "2", learningAreaId: "2", lessonsPerWeek: 1, doubleLessons: 0, status: "approved" },
    ];
    const result = generateTimetable(input);
    expect(result.entries.length).toBe(2);
    expect(result.conflicts).toHaveLength(0);
    const periods = result.entries.map((e) => e.periodNumber).sort();
    expect(periods).toEqual([1, 2]);
  });
