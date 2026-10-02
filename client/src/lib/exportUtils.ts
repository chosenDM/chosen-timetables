/**
 * Client-side export helpers (CSV + PDF download).
 */

import { buildTimetablePdf, buildTimetablePdfMultiPage, buildListPdf, buildExamMatrixPdf,
  buildRemedialMatrixPdf, SPAN_CONT } from "@shared/pdf";

type EntryLike = {
  dayIndex?: number;
  periodIndex?: number;
  dayName?: string;
  periodNumber?: number;
  label?: string;
  teacherId?: string;
  classId?: string;
  learningAreaId?: string;
  teacherName?: string;
  className?: string;
  learningAreaName?: string;
  lessonType?: string;
  room?: string;
};

function lookup(
  map: Record<string, unknown> | Map<string, unknown> | undefined,
  id?: string
): Record<string, string> | string | undefined {
  if (!id || !map) return undefined;
  if (map instanceof Map) return map.get(id) as Record<string, string> | string | undefined;
  return (map as Record<string, unknown>)[id] as Record<string, string> | string | undefined;
}

function field(
  map: Record<string, unknown> | Map<string, unknown> | undefined,
  id: string | undefined,
  key: string
): string {
  const v = lookup(map, id);
  if (!v) return "";
  if (typeof v === "string") return v;
  return String((v as Record<string, string>)[key] || (v as Record<string, string>).name || "");
}

/** Build grid with subject CODES; mark double continuations as SPAN_CONT */
export function buildGridFromEntries(opts: {
  days: string[];
  lessonPeriods: { periodNumber: number; kind?: string }[];
  entries: EntryLike[];
  mode: "master" | "class" | "teacher";
  teachers: Record<string, unknown> | Map<string, unknown>;
  classes: Record<string, unknown> | Map<string, unknown>;
  areas: Record<string, unknown> | Map<string, unknown>;
}): string[][];
export function buildGridFromEntries(
  entries: EntryLike[],
  dayCount: number,
  periodCount: number
): string[][];
export function buildGridFromEntries(
  a: unknown,
  b?: number,
  c?: number
): string[][] {
  if (a && typeof a === "object" && !Array.isArray(a) && "days" in (a as object)) {
    const opts = a as {
      days: string[];
      lessonPeriods: { periodNumber: number; kind?: string }[];
      entries: EntryLike[];
      mode: "master" | "class" | "teacher";
      teachers: Record<string, unknown> | Map<string, unknown>;
      classes: Record<string, unknown> | Map<string, unknown>;
      areas: Record<string, unknown> | Map<string, unknown>;
    };
    const dayCount = opts.days.length;
    const periodCount = opts.lessonPeriods.length;

    const dayIndexOf = (e: EntryLike) => {
      if (typeof e.dayIndex === "number") return e.dayIndex;
      if (e.dayName) {
        const name = e.dayName.toLowerCase();
        let i = opts.days.findIndex((d) => d.toLowerCase() === name);
        if (i < 0) {
          i = opts.days.findIndex((d) => d.toLowerCase().startsWith(name.slice(0, 2)));
        }
        return i;
      }
      return -1;
    };
    const periodIndexOf = (e: EntryLike) => {
      if (typeof e.periodIndex === "number") return e.periodIndex;
      if (typeof e.periodNumber === "number") {
        return opts.lessonPeriods.findIndex((p) => p.periodNumber === e.periodNumber);
      }
      return -1;
    };

    // Only lesson period indices (for finding next lesson after a double start)
    const lessonPeriodIndexes = opts.lessonPeriods
      .map((p, idx) => ({ idx, kind: p.kind || "lesson", num: p.periodNumber }))
      .filter((p) => p.kind === "lesson" || !p.kind);

    const grid: string[][] = Array.from({ length: dayCount }, () =>
      Array.from({ length: periodCount }, () => "")
    );

    // Place entries — doubles occupy two adjacent lesson columns (second = SPAN_CONT)
    for (const e of opts.entries) {
      const di = dayIndexOf(e);
      const pi = periodIndexOf(e);
      if (di < 0 || pi < 0 || di >= dayCount || pi >= periodCount) continue;

      // Double merge (SPAN_CONT) ONLY for class/teacher views — never for master
      if (opts.mode !== "master" && e.lessonType === "double") {
        const lessonIdx = lessonPeriodIndexes.findIndex((x) => x.idx === pi);
        if (lessonIdx > 0) {
          const prevPi = lessonPeriodIndexes[lessonIdx - 1].idx;
          if (prevPi === pi - 1) {
            const hasPair = opts.entries.some(
              (o) =>
                dayIndexOf(o) === di &&
                periodIndexOf(o) === prevPi &&
                o.lessonType === "double" &&
                o.teacherId === e.teacherId &&
                o.classId === e.classId &&
                o.learningAreaId === e.learningAreaId
            );
            if (hasPair) {
              grid[di][pi] = SPAN_CONT;
              continue;
            }
          }
        }
      }

      const code =
        e.learningAreaName ||
        field(opts.areas, e.learningAreaId, "code") ||
        field(opts.areas, e.learningAreaId, "name");
      const shortCode = String(code).slice(0, 8).toUpperCase();
      const cls = e.className || field(opts.classes, e.classId, "name");
      const teacherId =
        field(opts.teachers, e.teacherId, "identifier") ||
        field(opts.teachers, e.teacherId, "fullName");
      const teacherShort = String(teacherId).slice(0, 8);

      let cell = "";
      if (opts.mode === "master") {
        // Compact one line per class: Class - SUBJECT - code
        // Doubles: same line appears again in the next period cell (no merge)
        const clsShort = cls
          ? String(cls)
              .replace(/^Form\s*/i, "F")
              .replace(/^Grade\s*/i, "G")
              .slice(0, 10)
          : "";
        cell = [clsShort, shortCode, teacherShort].filter(Boolean).join(" - ");
      } else if (opts.mode === "class") {
        // Subject + teacher; room if set (joints stack via newline join below)
        const room = e.room ? String(e.room).slice(0, 10) : "";
        const line2 = [teacherShort, room].filter(Boolean).join(" ");
        cell = line2 ? `${shortCode}\n${line2}` : shortCode;
      } else {
        // Teacher view: subject; class under
        const c = cls ? String(cls).slice(0, 10) : "";
        const room = e.room ? String(e.room).slice(0, 8) : "";
        const line2 = [c, room].filter(Boolean).join(" ");
        cell = line2 ? `${shortCode}\n${line2}` : shortCode;
      }
      if (e.label && !cell) cell = e.label;

      if (cell) {
        const existing = grid[di][pi];
        if (existing && existing !== SPAN_CONT) {
          // Joint / parallel: stack vertically (ASC style) SUBJECT then code
          grid[di][pi] = existing + "\n" + cell;
        } else if (existing !== SPAN_CONT) {
          grid[di][pi] = cell;
        }
      }
    }

    return grid;
  }

  const entries = a as EntryLike[];
  const dayCount = b as number;
  const periodCount = c as number;
  const grid: string[][] = Array.from({ length: dayCount }, () =>
    Array.from({ length: periodCount }, () => "")
  );
  for (const e of entries) {
    const di = e.dayIndex ?? -1;
    const pi = e.periodIndex ?? -1;
    if (di >= 0 && di < dayCount && pi >= 0 && pi < periodCount) {
      grid[di][pi] = [e.learningAreaName || e.label || "", e.className || "", e.teacherName || ""]
        .filter(Boolean)
        .join(" ");
    }
  }
  return grid;
}

export function downloadCsv(filename: string, rows: string[][]) {
  const escape = (cell: string) => {
    const s = String(cell ?? "");
    if (s.includes(",") || s.includes('"') || s.includes("\n")) {
      return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
  };
  const csv = rows.map((row) => row.map(escape).join(",")).join("\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadPdf(filename: string, bytes: Uint8Array | ArrayBuffer) {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const copy = new Uint8Array(data.byteLength);
  copy.set(data);
  const blob = new Blob([copy], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".pdf") ? filename : `${filename}.pdf`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function buildTimetablePdfBytes(opts: {
  title: string;
  subtitle?: string;
  schoolName: string;
  days: string[];
  periods: { number: number; time: string; kind?: string; label?: string }[];
  grid: string[][];
  footer?: string;
  /** Master can span multiple pages; class/teacher stay single page */
  multiPage?: boolean;
}): Uint8Array {
  const payload = {
    title: opts.title,
    subtitle: opts.subtitle ?? "",
    schoolName: opts.schoolName,
    days: opts.days,
    periods: opts.periods.map((p) => ({
      number: p.number,
      time: p.time,
      kind: p.kind ?? "lesson",
      label: p.label,
    })),
    grid: opts.grid,
    footer: opts.footer,
  };
  if (opts.multiPage) {
    return buildTimetablePdfMultiPage({ ...payload, compactCells: true });
  }
  return buildTimetablePdf(payload);
}

export function buildListPdfBytes(opts: {
  title: string;
  schoolName: string;
  rows: string[][];
  footer?: string;
  landscape?: boolean;
}): Uint8Array {
  return buildListPdf({
    ...opts,
    landscape: opts.landscape ?? true,
  });
}


export function buildExamMatrixPdfBytes(opts: {
  schoolName: string;
  title: string;
  subtitle?: string;
  sessionColumns?: { key: string; label: string }[];
  rows?: {
    date: string;
    dayLabel: string;
    className: string;
    cells: Record<string, string>;
  }[];
  footer?: string;
  formColumns?: string[];
  examRows?: {
    date: string;
    dayLabel: string;
    sessionLabel: string;
    sessionTime: string;
    byForm: Record<string, string>;
  }[];
  dayBlocks?: {
    dayLabel: string;
    date: string;
    matrix: Record<string, Record<string, string>>;
  }[];
  sessions?: { key: string; label: string; startTime: string; endTime: string }[];
}): Uint8Array {
  return buildExamMatrixPdf(opts as Parameters<typeof buildExamMatrixPdf>[0]);
}


export function buildRemedialMatrixPdfBytes(opts: {
  schoolName: string;
  title: string;
  subtitle?: string;
  footer?: string;
  dayBlocks: {
    dayLabel: string;
    date?: string;
    matrix: Record<string, Record<string, string>>;
  }[];
  sessions: { key: string; label: string; startTime: string; endTime: string }[];
}): Uint8Array {
  return buildRemedialMatrixPdf(opts);
}
