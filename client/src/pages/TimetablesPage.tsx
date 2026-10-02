/**
 * Timetable generation, viewing (master / class / teacher), conflicts, lock.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import {
  generateAndSaveTimetable,
  getLatestTimetable,
  getTimetableEntries,
  listTimetables,
  lockEntry,
} from "@/services/timetableService";
import {
  listTeachers,
  listClasses,
  listLearningAreas,
  listPeriods,
  getScheduleSettings,
  getSchool,
} from "@/services/schoolService";
import { TimetableGrid } from "@/components/TimetableGrid";
import type {
  Timetable,
  TimetableEntry,
  Teacher,
  SchoolClass,
  LearningArea,
  Period,
  School,
  SchedulingConflict,
} from "@shared/types";
import { BRAND } from "@/lib/utils";
import { canGenerateTimetable, isFullAdmin } from "@/lib/roles";
import { Play, RefreshCw, Lock, Unlock, FileDown, FileSpreadsheet } from "lucide-react";
import {
  buildGridFromEntries,
  buildTimetablePdfBytes,
  downloadCsv,
  downloadPdf,
} from "@/lib/exportUtils";

type ViewMode = "master" | "class" | "teacher";

export default function TimetablesPage() {
  const { user, schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const canGenerate = canGenerateTimetable(schoolUser?.role);

  const [school, setSchool] = useState<School | null>(null);
  const [timetables, setTimetables] = useState<Timetable[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [conflicts, setConflicts] = useState<SchedulingConflict[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [areas, setAreas] = useState<LearningArea[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [days, setDays] = useState<string[]>(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const [mode, setMode] = useState<ViewMode>("master");
  const [filterId, setFilterId] = useState("");
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [meta, setMeta] = useState<{ score?: number; scheduled?: number; required?: number }>({});

  const loadBase = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [s, tts, t, c, a, p, settings] = await Promise.all([
        getSchool(schoolId),
        listTimetables(schoolId),
        listTeachers(schoolId),
        listClasses(schoolId),
        listLearningAreas(schoolId),
        listPeriods(schoolId),
        getScheduleSettings(schoolId),
      ]);
      setSchool(s);
      setTimetables(tts);
      setTeachers(t.filter((x) => x.active !== false));
      setClasses(c.filter((x) => x.active !== false));
      setAreas(a.filter((x) => x.active !== false));
      setPeriods(p);
      if (settings?.workingDays?.length) setDays(settings.workingDays);

      if (tts.length) {
        const latest = tts[0];
        setActiveId(latest.id);
        await loadEntries(schoolId, latest.id, latest as any);
      }
    } catch {
      toast.error("Failed to load timetable data");
    } finally {
      setLoading(false);
    }
  };

  const loadEntries = async (sid: string, tid: string, metaDoc?: any) => {
    const ents = await getTimetableEntries(sid, tid);
    setEntries(ents);
    if (metaDoc) {
      setConflicts((metaDoc.conflicts as SchedulingConflict[]) || []);
      setMeta({
        score: metaDoc.score,
        scheduled: metaDoc.scheduledLessons,
        required: metaDoc.requiredLessons,
      });
    }
  };

  useEffect(() => {
    loadBase();
  }, [schoolId]);

  const handleGenerate = async (preserveLocks = false) => {
    if (!canGenerate) {
      toast.error("Only principal or timetable administrator can generate timetables");
      return;
    }
    if (!schoolId || !user) return;
    setGenerating(true);
    try {
      const { timetableId, result } = await generateAndSaveTimetable(schoolId, user.uid, {
        preserveLocks,
        existingTimetableId: preserveLocks ? activeId ?? undefined : undefined,
      });
      toast.success(
        result.conflicts.length
          ? `Generated with ${result.conflicts.length} conflict(s) — score ${result.score}%`
          : `Timetable generated — ${result.scheduledLessons}/${result.requiredLessons} lessons`
      );
      await loadBase();
      setActiveId(timetableId);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Generation failed");
    } finally {
      setGenerating(false);
    }
  };

  const handleLock = async (entry: TimetableEntry) => {
    if (!schoolId || !activeId) return;
    try {
      await lockEntry(schoolId, activeId, entry.id, !entry.locked);
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, locked: !e.locked } : e))
      );
      toast.success(entry.locked ? "Unlocked" : "Locked");
    } catch {
      toast.error("Failed to update lock");
    }
  };

  const filteredEntries =
    mode === "master"
      ? entries
      : mode === "class"
        ? entries.filter((e) => e.classId === filterId)
        : entries.filter((e) => e.teacherId === filterId);


  const sortedPeriods = [...periods].sort((a, b) => a.displayOrder - b.displayOrder);
  const lessonPeriods = sortedPeriods.filter((p) => p.kind === "lesson");

  const [upgradeOpen, setUpgradeOpen] = useState(false);

  const handleExportPdf = async () => {
    if (!entries.length) {
      toast.error("No timetable to export");
      return;
    }
    // Free trial: one class PDF only (backend-enforced)
    if (mode === "class" && filterId && schoolId) {
      const plan = (school?.plan || "trial").toLowerCase();
      const paid =
        plan === "lifetime" ||
        ((plan === "monthly" || plan === "termly" || plan === "yearly") &&
          ["active", "paid"].includes((school?.paymentStatus || "").toLowerCase()));
      if (!paid) {
        try {
          const fn = httpsCallable(functions, "requestClassPdfDownload");
          const res = await fn({
            schoolId,
            classId: filterId,
            className: classes.find((c) => c.id === filterId)?.name || filterId,
          });
          const data = res.data as { allowed?: boolean; message?: string; reason?: string };
          if (!data.allowed) {
            setUpgradeOpen(true);
            toast.error(data.message || "Upgrade to download more class timetables");
            return;
          }
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : "Download check failed";
          // If function not deployed yet, still allow but warn
          if (msg.includes("not-found") || msg.includes("NOT_FOUND")) {
            toast.message("Deploy functions to enforce trial PDF limits");
          } else {
            toast.error(msg);
            return;
          }
        }
      }
    }

    // Plain objects — Maps break name lookup in buildGridFromEntries
    const teacherMap = Object.fromEntries(teachers.map((t) => [t.id, t]));
    const classMap = Object.fromEntries(classes.map((c) => [c.id, c]));
    const areaMap = Object.fromEntries(
      areas.map((a) => [a.id, { code: a.code, name: a.name }])
    );
    const viewEntries =
      mode === "master"
        ? entries
        : mode === "class"
          ? entries.filter((e) => e.classId === filterId)
          : entries.filter((e) => e.teacherId === filterId);
    if (mode !== "master" && !filterId) {
      toast.error(`Select a ${mode} first`);
      return;
    }
    // Include ALL periods (lessons + breaks + lunch + games) so PDF matches the grid
    const grid = buildGridFromEntries({
      days,
      lessonPeriods: sortedPeriods,
      entries: viewEntries,
      mode,
      teachers: teacherMap,
      classes: classMap,
      areas: areaMap,
    });
    const title =
      mode === "master"
        ? "MASTER TIMETABLE"
        : mode === "class"
          ? (classes.find((c) => c.id === filterId)?.name ?? "CLASS").toUpperCase()
          : (() => {
              const t = teachers.find((x) => x.id === filterId);
              if (!t) return "TEACHER";
              const code = t.identifier ? ` (${t.identifier})` : "";
              return `${t.fullName}${code}`.toUpperCase();
            })();
    const bytes = buildTimetablePdfBytes({
      schoolName: school?.name || "School",
      title,
      subtitle: `${school?.academicYear || ""} · ${school?.term || ""}`,
      days,
      periods: sortedPeriods.map((p) => ({
        number: p.periodNumber,
        time: `${p.startTime}-${p.endTime}`,
        kind: p.kind || "lesson",
        label: p.label,
      })),
      grid,
      footer: `Chosen Time Tables · Generated ${new Date().toLocaleDateString()}`,
      multiPage: mode === "master",
    });
    const safe = title.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
    downloadPdf(`${safe}-timetable.pdf`, bytes);
    toast.success("PDF downloaded");
  };

  const handleExportCsv = () => {
    if (!entries.length) {
      toast.error("No timetable to export");
      return;
    }
    const viewEntries =
      mode === "master"
        ? entries
        : mode === "class"
          ? entries.filter((e) => e.classId === filterId)
          : entries.filter((e) => e.teacherId === filterId);
    if (mode !== "master" && !filterId) {
      toast.error(`Select a ${mode} first`);
      return;
    }
    const teacherMap = new Map(teachers.map((t) => [t.id, t]));
    const classMap = new Map(classes.map((c) => [c.id, c]));
    const areaMap = new Map(areas.map((a) => [a.id, a]));
    const rows: string[][] = [
      ["Day", "Period", "Subject", "Code", "Teacher", "Teacher ID", "Class", "Type", "Locked"],
    ];
    for (const e of viewEntries) {
      const area = areaMap.get(e.learningAreaId);
      const teacher = teacherMap.get(e.teacherId);
      const cls = classMap.get(e.classId);
      rows.push([
        e.dayName,
        String(e.periodNumber),
        area?.name || "",
        area?.code || "",
        teacher?.fullName || "",
        teacher?.identifier || "",
        cls?.name || "",
        e.lessonType || "lesson",
        e.locked ? "yes" : "no",
      ]);
    }
    downloadCsv(`timetable-${mode}.csv`, rows);
    toast.success("CSV downloaded");
  };


  if (!schoolId) {
    return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Timetables</h1>
          <p className="text-sm text-slate-500">
            Generate from approved allocations · Hard constraints enforced · Lock lessons to protect them
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={() => handleGenerate(false)}
            disabled={!canGenerate || generating}
            title={!canGenerate ? "Only principal / timetable admin can generate" : undefined}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
            style={{ backgroundColor: BRAND.blue }}
          >
            <Play className="w-4 h-4" />
            {generating ? "Generating…" : "Generate"}
          </button>
          {activeId && (
            <button
              onClick={() => handleGenerate(true)}
              disabled={generating}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium disabled:opacity-60"
            >
              <RefreshCw className="w-4 h-4" />
              Regenerate (keep locks)
            </button>
          )}
          <button
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium"
          >
            <FileDown className="w-4 h-4" />
            Export PDF
          </button>
          <button
            onClick={handleExportCsv}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg border text-sm font-medium"
          >
            <FileSpreadsheet className="w-4 h-4" />
            Export CSV
          </button>
        </div>
      </div>

      {/* Stats */}
      {(meta.score != null || conflicts.length > 0) && (
        <div className="grid sm:grid-cols-3 gap-3">
          <Stat label="Score" value={meta.score != null ? `${meta.score}%` : "—"} />
          <Stat label="Scheduled" value={`${meta.scheduled ?? "—"} / ${meta.required ?? "—"}`} />
          <Stat label="Conflicts" value={String(conflicts.length)} warn={conflicts.length > 0} />
        </div>
      )}

      {/* View mode */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">View</label>
          <select
            value={mode}
            onChange={(e) => {
              setMode(e.target.value as ViewMode);
              setFilterId("");
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="master">Master</option>
            <option value="class">Class</option>
            <option value="teacher">Teacher</option>
          </select>
        </div>
        {mode === "class" && (
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Class</label>
            <select
              value={filterId}
              onChange={(e) => setFilterId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select class…</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        )}
        {mode === "teacher" && (
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Teacher</label>
            <select
              value={filterId}
              onChange={(e) => setFilterId(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option value="">Select teacher…</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>{t.fullName} ({t.identifier})</option>
              ))}
            </select>
          </div>
        )}
        {timetables.length > 1 && (
          <div className="min-w-[180px]">
            <label className="block text-xs font-medium text-slate-500 mb-1">Version</label>
            <select
              value={activeId || ""}
              onChange={async (e) => {
                const id = e.target.value;
                setActiveId(id);
                if (schoolId && id) {
                  const tt = timetables.find((t) => t.id === id) as any;
                  await loadEntries(schoolId, id, tt);
                }
              }}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              {timetables.map((t) => (
                <option key={t.id} value={t.id}>
                  {(t as any).name || t.id} · v{t.version}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {/* Conflicts — beginner-friendly */}
      {conflicts.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 space-y-3">
          <h3 className="font-semibold text-amber-900">Timetable Issues and Solutions</h3>
          <p className="text-xs text-amber-800">
            Each card explains what went wrong and exactly what to do. Fix the items, then click Generate again.
          </p>
          <div className="flex flex-wrap gap-2 text-xs">
            <a href="/app/availability" className="px-2 py-1 rounded bg-white border hover:bg-slate-50">
              Adjust teacher availability
            </a>
            <a href="/app/allocations" className="px-2 py-1 rounded bg-white border hover:bg-slate-50">
              Review subject allocations
            </a>
            <a href="/app/periods" className="px-2 py-1 rounded bg-white border hover:bg-slate-50">
              Check periods / double lessons
            </a>
          </div>
          {conflicts.map((c, i) => (
            <div key={i} className="text-sm bg-white/70 rounded-lg p-3 border border-amber-100">
              <p className="font-medium text-slate-800">{c.message}</p>
              {c.requiredLessons != null && (
                <p className="text-slate-600 mt-1">
                  Required lessons/week: {c.requiredLessons} · Placed: {c.scheduledLessons ?? 0} · Still needed:{" "}
                  {(c.requiredLessons ?? 0) - (c.scheduledLessons ?? 0)}
                </p>
              )}
              {c.reasons?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-slate-700">Why this happened</p>
                  <ul className="text-slate-600 list-disc list-inside">
                    {c.reasons.map((r, j) => (
                      <li key={j}>{r}</li>
                    ))}
                  </ul>
                </div>
              )}
              {c.suggestions?.length > 0 && (
                <div className="mt-2">
                  <p className="text-xs font-semibold text-emerald-800">What you should do</p>
                  <ol className="text-slate-700 list-decimal list-inside space-y-0.5">
                    {c.suggestions.map((s, j) => (
                      <li key={j}>{s}</li>
                    ))}
                  </ol>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      
      {upgradeOpen && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl space-y-3">
            <h3 className="text-lg font-bold text-slate-900">Unlock All Your School Timetables</h3>
            <p className="text-sm text-slate-600">
              You have used your free timetable download. Upgrade your subscription to download
              timetables for all classes and access the full benefits of Chosen Time Tables.
            </p>
            <div className="flex flex-col sm:flex-row gap-2">
              <a
                href="/app/billing"
                className="inline-flex justify-center px-4 py-2 rounded-lg bg-slate-900 text-white text-sm font-medium"
              >
                View Subscription Plans
              </a>
              <button
                type="button"
                className="px-4 py-2 rounded-lg border text-sm"
                onClick={() => setUpgradeOpen(false)}
              >
                Continue Using Preview
              </button>
            </div>
          </div>
        </div>
      )}

{/* Grid */}
      {(mode === "master" || filterId) && entries.length > 0 ? (
        <TimetableGrid
          mode={mode}
          schoolName={school?.name}
          academicYear={school?.academicYear}
          term={school?.term}
          version={timetables.find((t) => t.id === activeId)?.version}
          days={days}
          periods={periods.map((p) => ({
            id: p.id,
            periodNumber: p.periodNumber,
            label: p.label,
            startTime: p.startTime,
            endTime: p.endTime,
            kind: p.kind,
            displayOrder: p.displayOrder,
          }))}
          entries={filteredEntries.map((e) => ({
            dayName: e.dayName,
            periodNumber: e.periodNumber,
            classId: e.classId,
            teacherId: e.teacherId,
            learningAreaId: e.learningAreaId,
            lessonType: e.lessonType,
            locked: e.locked,
          }))}
          teachers={teachers.map((t) => ({ id: t.id, fullName: t.fullName, identifier: t.identifier }))}
          classes={classes.map((c) => ({ id: c.id, name: c.name }))}
          learningAreas={areas.map((a) => ({ id: a.id, name: a.name, code: a.code }))}
        />
      ) : entries.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
          No timetable yet. Approve allocations, then click Generate.
        </div>
      ) : (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
          Select a {mode} above to view the grid.
        </div>
      )}

      {/* Entry list with lock controls (class/teacher view) */}
      {filterId && filteredEntries.length > 0 && (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Day</th>
                <th className="px-4 py-3 font-medium">Period</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Lock</th>
              </tr>
            </thead>
            <tbody>
              {filteredEntries.map((e) => {
                const area = areas.find((a) => a.id === e.learningAreaId);
                return (
                  <tr key={e.id} className="border-t">
                    <td className="px-4 py-2">{e.dayName}</td>
                    <td className="px-4 py-2">P{e.periodNumber}</td>
                    <td className="px-4 py-2">{area?.name || e.learningAreaId}</td>
                    <td className="px-4 py-2 capitalize">{e.lessonType}</td>
                    <td className="px-4 py-2">
                      <button
                        onClick={() => handleLock(e)}
                        className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-brand-blue"
                      >
                        {e.locked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                        {e.locked ? "Locked" : "Lock"}
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, warn }: { label: string; value: string; warn?: boolean }) {
  return (
    <div className={`rounded-xl border p-4 ${warn ? "bg-amber-50 border-amber-200" : "bg-white"}`}>
      <p className="text-xs text-slate-500">{label}</p>
      <p className={`text-xl font-bold ${warn ? "text-amber-800" : "text-slate-900"}`}>{value}</p>
    </div>
  );
}
