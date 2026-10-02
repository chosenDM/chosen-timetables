/**
 * Role helpers for Chosen Time Tables.
 * Principal and Timetable Admin are equivalent (full access).
 * HOD is scoped to their departmentId.
 */

import type { UserRole } from "@shared/types";

export function isFullAdmin(role?: UserRole | null): boolean {
  return role === "principal" || role === "timetable_admin";
}

export function isHod(role?: UserRole | null): boolean {
  return role === "hod";
}

export function canManageUsers(role?: UserRole | null): boolean {
  return isFullAdmin(role);
}

export function canGenerateTimetable(role?: UserRole | null): boolean {
  return isFullAdmin(role);
}

export function canApproveAllocations(role?: UserRole | null): boolean {
  return isFullAdmin(role);
}

/** HOD or full admin can create/edit allocations */
export function canEditAllocations(role?: UserRole | null): boolean {
  return isFullAdmin(role) || isHod(role);
}

/** Modules HOD may open (department-scoped where applicable) */
export function canAccessModule(
  role: UserRole | undefined | null,
  module: string
): boolean {
  if (isFullAdmin(role)) return true;
  if (role === "viewer" || role === "teacher") {
    // View-only modules
    return [
      "dashboard",
      "timetables",
      "exams",
      "remedial",
      "reports",
      "availability",
    ].includes(module);
  }
  if (isHod(role)) {
    return [
      "dashboard",
      "teachers",
      "classes",
      "learning-areas",
      "allocations",
      "timetables", // view only — generate blocked in page
      "reports",
    ].includes(module);
  }
  return false;
}

/** Filter list items to HOD department when applicable */
export function filterByHodDepartment<T extends { departmentId?: string }>(
  items: T[],
  role: UserRole | undefined | null,
  hodDepartmentId?: string | null
): T[] {
  if (isFullAdmin(role) || !isHod(role) || !hodDepartmentId) return items;
  return items.filter((x) => x.departmentId === hodDepartmentId);
}
