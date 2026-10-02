/**
 * TimetableGrid — master / class / teacher views.
 * Double lessons render as one merged cell (colSpan=2).
 * Break columns show bold labels.
 */

export type GridPeriod = {
  id: string;
  periodNumber: number;
  label: string;
  startTime: string;
  endTime: string;
  kind: string;
  displayOrder: number;
};

export type GridEntry = {
  dayName: string;
  periodNumber: number;
  classId: string;
  teacherId: string;
  learningAreaId: string;
  lessonType?: "lesson" | "double";
  locked?: boolean;
  jointGroupId?: string;
};

export type GridTeacher = { id: string; fullName: string; identifier: string };
export type GridClass = { id: string; name: string };
export type GridArea = { id: string; name: string; code: string };

type Props = {
  mode: "master" | "class" | "teacher";
  schoolName?: string;
  academicYear?: string;
  term?: string;
  version?: number;
  days: string[];
  periods: GridPeriod[];
  entries: GridEntry[];
  teachers: GridTeacher[];
  classes: GridClass[];
  learningAreas: GridArea[];
  /** Optional title override e.g. class or teacher name */
  viewTitle?: string;
};

export function TimetableGrid({
  mode,
  schoolName,
  academicYear,
  term,
  version,
  days,
  periods,
  entries,
  teachers,
  classes,
  learningAreas,
  viewTitle,
}: Props) {
  const allPeriods = [...periods].sort((a, b) => a.displayOrder - b.displayOrder);
  const teacherMap = new Map(teachers.map((t) => [t.id, t]));
  const classMap = new Map(classes.map((c) => [c.id, c]));
  const areaMap = new Map(learningAreas.map((a) => [a.id, a]));

  const entriesAt = (day: string, periodNumber: number) =>
    entries.filter((e) => e.dayName === day && e.periodNumber === periodNumber);

  const formatCell = (list: GridEntry[]) => {
    if (!list.length) return null;
    // ASC-style: stack subjects vertically (code + teacher under each)
    return list
      .map((e) => {
        const area = areaMap.get(e.learningAreaId);
        const teacher = teacherMap.get(e.teacherId);
        const cls = classMap.get(e.classId);
        const code = (area?.code || area?.name || "?").toString().toUpperCase();
        const tcode = teacher?.identifier || "?";
        if (mode === "master") {
          const cname = cls?.name?.replace(/^Form\s*/i, "F").replace(/^Grade\s*/i, "G") || "";
          return `${code}\n${tcode} ${cname}`.trim();
        }
        if (mode === "class") return `${code}\n${tcode}`;
        return `${code}\n${cls?.name ?? ""}`;
      })
      .join("\n");
  };

  /** True if this period is the second half of a double that started on previous lesson period */
  const isDoubleContinuation = (day: string, periodNumber: number) => {
    const here = entriesAt(day, periodNumber);
    if (!here.some((e) => e.lessonType === "double")) return false;
    // Find previous lesson period number
    const lessonPeriods = allPeriods.filter((p) => p.kind === "lesson");
    const idx = lessonPeriods.findIndex((p) => p.periodNumber === periodNumber);
    if (idx <= 0) return false;
    const prevNum = lessonPeriods[idx - 1].periodNumber;
    const prev = entriesAt(day, prevNum);
    return prev.some(
      (e) =>
        e.lessonType === "double" &&
        here.some(
          (h) =>
            h.teacherId === e.teacherId &&
            h.classId === e.classId &&
            h.learningAreaId === e.learningAreaId
        )
    );
  };

  const isDoubleStart = (day: string, periodNumber: number) => {
    const here = entriesAt(day, periodNumber);
    if (!here.some((e) => e.lessonType === "double")) return false;
    return !isDoubleContinuation(day, periodNumber);
  };

  const title =
    viewTitle ||
    (mode === "master" ? "Master Timetable" : mode === "class" ? "Class Timetable" : "Teacher Timetable");

  if (!entries.length) {
    return (
      <div className="rounded-2xl border bg-white p-8 text-center text-sm text-slate-500">
        Generate a timetable to view the grid.
      </div>
    );
  }

  return (
    <div className="rounded-2xl border bg-white p-4 md:p-5 shadow-sm">
      <p className="text-xs font-bold uppercase tracking-wider text-brand-blue">{schoolName}</p>
      <h2 className="mt-1 text-xl md:text-2xl font-bold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-500">
        {academicYear} · {term}
        {version != null ? ` · v${version}` : ""}
      </p>
      <div className="mt-5 overflow-x-auto -mx-1 px-1 overscroll-x-contain">
        <table className="w-full min-w-[640px] border-collapse text-left text-xs">
          <thead>
            <tr>
              <th className="border border-slate-300 bg-slate-50 px-2 py-2 sticky left-0 z-10">Day</th>
              {allPeriods.map((p) => (
                <th key={p.id} className="border border-slate-300 bg-slate-50 px-2 py-2">
                  <span className="block font-bold">
                    {p.kind === "lesson" ? `P${p.periodNumber}` : p.label || p.kind.replace("_", " ")}
                  </span>
                  <span className="mt-0.5 block text-[9px] font-normal text-slate-400">
                    {p.startTime}–{p.endTime}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {days.map((day) => (
              <tr key={day}>
                <th className="border border-slate-300 bg-slate-50 px-2 py-2 font-bold text-slate-700 sticky left-0 z-10">
                  {day.slice(0, 3)}
                </th>
                {allPeriods.map((p) => {
                  if (p.kind !== "lesson") {
                    return (
                      <td
                        key={p.id}
                        className="border border-slate-300 bg-slate-100 px-1 py-2 text-center text-[10px] font-bold uppercase text-slate-600"
                      >
                        {(p.label || p.kind.replace("_", " ")).slice(0, 12)}
                      </td>
                    );
                  }

                  // Skip second half of double — merged into previous cell (not on master)
                  if (mode !== "master" && isDoubleContinuation(day, p.periodNumber)) {
                    return null;
                  }

                  const list = entriesAt(day, p.periodNumber);
                  const doubleStart = mode !== "master" && isDoubleStart(day, p.periodNumber);
                  const colSpan = doubleStart ? 2 : 1;
                  const text = formatCell(list);

                  return (
                    <td
                      key={p.id}
                      colSpan={colSpan}
                      className={`border border-slate-300 px-2 py-2 align-middle text-center ${
                        doubleStart ? "bg-blue-50/50 font-semibold" : ""
                      }`}
                    >
                      {text ? (
                        <span className="text-slate-800 whitespace-pre-line leading-tight text-xs sm:text-sm font-semibold">
                          {text}
                        </span>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
