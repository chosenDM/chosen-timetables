/**
 * Shared client utilities and brand tokens.
 */

import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Brand colours — Chosen Digital Solutions */
export const BRAND = {
  blue: "#1461C4",
  orange: "#F57231",
  green: "#2F7419",
} as const;

/** Tailwind className merger */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}
