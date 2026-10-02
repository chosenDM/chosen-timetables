/**
 * Remedial module — own days/periods (does NOT touch main timetable).
 * Morning/Evening Mon–Fri + optional Saturday slots.
 * Availability ticks · Generate random assignment · Landscape table PDF.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  collection,
  addDoc,
  getDocs,
  deleteDoc,
  doc,
  query,
  orderBy,
  setDoc,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  listClasses,
  listLearningAreas,
  listTeachers,
} from "@/services/schoolService";
import type { SchoolClass, LearningArea, Teacher } from "@shared/types";
import { Plus, Trash2, FileDown, Shuffle, Save, Archive } from "lucide-react";
import { downloadPdf, buildRemedialMatrixPdfBytes } from "@/lib/exportUtils";
import { isFullAdmin } from "@/lib/roles";

interface RemedialPeriod {
  id: string;
  label: string; // Morning | Evening | Sat 1 …
  startTime: string;
  endTime: string;
  forSaturdayOnly?: boolean;
}

interface RemedialSession {
  id: string;
  schoolId: string;
  classId: string;
  teacherId: string;
  learningAreaId: string;
  dayName: string;
  periodId: string;
  periodLabel: string;
  startTime: string;
  endTime: string;
  notes?: string;
  createdAt: string;
  weekId?: string;
  generated?: boolean;
}

interface RemedialWeek {
  id: string;
  schoolId: string;
  name: string;
  weekStart: string;
  weekEnd: string;
  status: "draft" | "published" | "archived";
  createdAt: string;
  updatedAt: string;
}

/** teacherId -> list of "Day|periodId" keys they accept */
type AvailMap = Record<string, string[]>;

const WEEKDAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];
const ALL_DAYS = [...WEEKDAYS, "Saturday"];

const DEFAULT_PERIODS: RemedialPeriod[] = [
  { id: "morning", label: "Morning", startTime: "07:00", endTime: "07:40", forSaturdayOnly: false },
  { id: "evening", label: "Evening", startTime: "16:00", endTime: "16:40", forSaturdayOnly: false },
  { id: "sat1", label: "Sat Session 1", startTime: "08:00", endTime: "09:00", forSaturdayOnly: true },
  { id: "sat2", label: "Sat Session 2", startTime: "09:15", endTime: "10:15", forSaturdayOnly: true },
  { id: "sat3", label: "Sat Session 3", startTime: "10:30", endTime: "11:30", forSaturdayOnly: true },
  { id: "sat4", label: "Sat Session 4", startTime: "11:45", endTime: "12:45", forSaturdayOnly: true },
];

export default function RemedialPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const canEdit = isFullAdmin(schoolUser?.role);

  const [tab, setTab] = useState<"periods" | "availability" | "sessions" | "generate">("sessions");
  const [sessions, setSessions] = useState<RemedialSession[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [areas, setAreas] = useState<LearningArea[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [days, setDays] = useState<string[]>([...WEEKDAYS, "Saturday"]);
  const [periods, setPeriods] = useState<RemedialPeriod[]>(DEFAULT_PERIODS);
  const [availability, setAvailability] = useState<AvailMap>({});
  const [participating, setParticipating] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Manual form
  const [classId, setClassId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [learningAreaId, setLearningAreaId] = useState("");
  const [dayName, setDayName] = useState("Monday");
  const [periodId, setPeriodId] = useState("morning");
  const [showForm, setShowForm] = useState(false);

  // Generate: requests class+subject (+ optional day/period)
  const [genClassId, setGenClassId] = useState("");
  const [genAreaId, setGenAreaId] = useState("");
  const [genDay, setGenDay] = useState("");
  const [genPeriodId, setGenPeriodId] = useState("");
  const [requests, setRequests] = useState<
    { classId: string; learningAreaId: string; dayName?: string; periodId?: string }[]
  >([]);

  const [weeks, setWeeks] = useState<RemedialWeek[]>([]);
  const [activeWeekId, setActiveWeekId] = useState<string>("");
  const [showNewWeek, setShowNewWeek] = useState(false);
  const [newWeekName, setNewWeekName] = useState("");
  const [newWeekStart, setNewWeekStart] = useState("");
  const [newWeekEnd, setNewWeekEnd] = useState("");
  const [unscheduled, setUnscheduled] = useState<string[]>([]);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [sess, c, a, t, settings, weekSnap] = await Promise.all([
        getDocs(query(collection(db, "schools", schoolId, "remedialTimetables"), orderBy("dayName"))),
        listClasses(schoolId),
        listLearningAreas(schoolId),
        listTeachers(schoolId),
        getDoc(doc(db, "schools", schoolId, "settings", "remedial")),
        getDocs(query(collection(db, "schools", schoolId, "remedialWeeks"), orderBy("weekStart", "desc"))),
      ]);
      const weekList = weekSnap.docs.map((d) => ({ id: d.id, ...d.data() } as RemedialWeek));
      setWeeks(weekList);
      let weekId = activeWeekId;
      if (!weekId || !weekList.some((w) => w.id === weekId)) {
        weekId = weekList.find((w) => w.status !== "archived")?.id || weekList[0]?.id || "";
        setActiveWeekId(weekId);
      }
      const allSess = sess.docs.map((d) => ({ id: d.id, ...d.data() } as RemedialSession));
      // Sessions for active week; legacy sessions without weekId show when no weeks yet
      const filtered = weekId
        ? allSess.filter((s) => s.weekId === weekId || (!s.weekId && !weekList.length))
        : allSess;
      setSessions(filtered);
      setClasses(c.filter((x) => x.active !== false));
      setAreas(a.filter((x) => x.active !== false));
      const activeTeachers = t.filter((x) => x.active !== false);
      setTeachers(activeTeachers);
      if (settings.exists()) {
        const d = settings.data();
        if (Array.isArray(d?.days) && d.days.length) setDays(d.days);
        if (Array.isArray(d?.periods) && d.periods.length) setPeriods(d.periods as RemedialPeriod[]);
        if (d?.availability && typeof d.availability === "object")
          setAvailability(d.availability as AvailMap);
        if (Array.isArray(d?.participating)) setParticipating(d.participating as string[]);
      }
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load remedial");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId]);

  useEffect(() => {
    if (schoolId && activeWeekId) load();
  }, [activeWeekId]);

  const className = (id: string) => classes.find((c) => c.id === id)?.name || id;
  const areaCode = (id: string) => {
    const a = areas.find((x) => x.id === id);
    return (a?.code || a?.name || id).toString().slice(0, 8).toUpperCase();
  };
  const teacherCode = (id: string) =>
    teachers.find((x) => x.id === id)?.identifier ||
    teachers.find((x) => x.id === id)?.fullName?.slice(0, 6) ||
    "";

  const periodsForDay = (day: string) =>
    periods.filter((p) =>
      day === "Saturday" ? true : !p.forSaturdayOnly
    );

  const saveSettings = async (patch: Record<string, unknown>) => {
    if (!schoolId || !canEdit) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, "schools", schoolId, "settings", "remedial"),
        { schoolId, updatedAt: new Date().toISOString(), ...patch },
        { merge: true }
      );
      toast.success("Remedial settings saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleAddSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !canEdit || !classId || !teacherId || !learningAreaId) {
      toast.error("Fill class, subject and teacher");
      return;
    }
    const p = periods.find((x) => x.id === periodId);
    if (!p) {
      toast.error("Select a period");
      return;
    }
    setSaving(true);
    try {
      await addDoc(collection(db, "schools", schoolId, "remedialTimetables"), {
        schoolId,
        weekId: activeWeekId || null,
        classId,
        teacherId,
        learningAreaId,
        dayName,
        periodId: p.id,
        periodLabel: p.label,
        startTime: p.startTime,
        endTime: p.endTime,
        createdAt: new Date().toISOString(),
      });
      toast.success("Remedial session added");
      setShowForm(false);
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!schoolId || !canEdit || !confirm("Delete this session?")) return;
    await deleteDoc(doc(db, "schools", schoolId, "remedialTimetables", id));
    toast.success("Deleted");
    load();
  };

  const toggleAvail = (tid: string, day: string, pid: string) => {
    const key = `${day}|${pid}`;
    setAvailability((prev) => {
      const cur = new Set(prev[tid] || []);
      if (cur.has(key)) cur.delete(key);
      else cur.add(key);
      return { ...prev, [tid]: Array.from(cur) };
    });
  };

  const toggleParticipating = (tid: string) => {
    setParticipating((prev) =>
      prev.includes(tid) ? prev.filter((x) => x !== tid) : [...prev, tid]
    );
  };

  const handleGenerate = async () => {
    if (!schoolId || !canEdit) return;
    if (!requests.length) {
      toast.error("Add at least one class + subject request");
      return;
    }
    if (!participating.length) {
      toast.error("Tick teachers who will take remedial");
      return;
    }
    if (!activeWeekId) {
      toast.error("Create a weekly remedial timetable first (+ New Remedial Timetable)");
      return;
    }
    setSaving(true);
    try {
      // One placement attempt per request — not every day×period expansion
      const classBusy = new Set<string>();
      const teacherBusy = new Set<string>();
      // Seed with existing sessions this week (non-generated kept; we replace generated)
      for (const s of sessions) {
        if (s.generated) continue;
        const k = `${s.dayName}|${s.periodId}`;
        classBusy.add(`${s.classId}|${k}`);
        teacherBusy.add(`${s.teacherId}|${k}`);
      }

      const toWrite: Array<{
        classId: string;
        teacherId: string;
        learningAreaId: string;
        dayName: string;
        period: RemedialPeriod;
      }> = [];
      const failed: string[] = [];

      // Delete previous generated sessions for this week
      const toDelete = sessions.filter((s) => s.generated && (s.weekId === activeWeekId || !s.weekId));
      const batch = writeBatch(db);
      for (const s of toDelete) {
        batch.delete(doc(db, "schools", schoolId, "remedialTimetables", s.id));
      }

      for (const r of requests) {
        const dayList = r.dayName ? [r.dayName] : days;
        let placed = false;
        // Shuffle days/periods lightly for spread
        const candidates: { day: string; period: RemedialPeriod }[] = [];
        for (const day of dayList) {
          const plist = periodsForDay(day);
          const periodList = r.periodId
            ? plist.filter((p) => p.id === r.periodId)
            : plist;
          for (const period of periodList) {
            candidates.push({ day, period });
          }
        }
        // Prefer morning then evening order as configured
        for (const { day, period } of candidates) {
          const slotKey = `${day}|${period.id}`;
          if (classBusy.has(`${r.classId}|${slotKey}`)) continue;

          // Teachers available for this slot (strict if any ticks exist for them)
          let pool = participating.filter((tid) => {
            const ticks = availability[tid] || [];
            if (ticks.length === 0) return true; // no ticks = treat as flexible
            return ticks.includes(slotKey);
          });
          pool = pool.filter((tid) => !teacherBusy.has(`${tid}|${slotKey}`));
          if (!pool.length) continue;

          const tid = pool[Math.floor(Math.random() * pool.length)];
          classBusy.add(`${r.classId}|${slotKey}`);
          teacherBusy.add(`${tid}|${slotKey}`);
          toWrite.push({
            classId: r.classId,
            teacherId: tid,
            learningAreaId: r.learningAreaId,
            dayName: day,
            period,
          });
          placed = true;
          break;
        }
        if (!placed) {
          const cname = classes.find((c) => c.id === r.classId)?.name || r.classId;
          const aname = areas.find((a) => a.id === r.learningAreaId)?.name || r.learningAreaId;
          failed.push(
            `${cname} — ${aname}: no free session (class already has a lesson or no available teacher).`
          );
        }
      }

      for (const slot of toWrite) {
        const ref = doc(collection(db, "schools", schoolId, "remedialTimetables"));
        batch.set(ref, {
          schoolId,
          weekId: activeWeekId,
          classId: slot.classId,
          teacherId: slot.teacherId,
          learningAreaId: slot.learningAreaId,
          dayName: slot.dayName,
          periodId: slot.period.id,
          periodLabel: slot.period.label,
          startTime: slot.period.startTime,
          endTime: slot.period.endTime,
          createdAt: new Date().toISOString(),
          generated: true,
        });
      }
      await batch.commit();
      await saveSettings({ participating, availability, days, periods, activeWeekId });
      setUnscheduled(failed);
      if (failed.length) {
        toast.warning(`Placed ${toWrite.length}. ${failed.length} could not be scheduled — see warnings.`);
      } else {
        toast.success(`Generated ${toWrite.length} remedial lessons (no class/teacher double-booking)`);
      }
      setTab("sessions");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Generate failed");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = () => {
    if (!sessions.length) {
      toast.error("No remedial sessions for this week");
      return;
    }
    const dayOrder = days.length ? days : ALL_DAYS;
    const useDays = dayOrder.filter((d) => sessions.some((s) => s.dayName === d));
    const daysFinal = useDays.length ? useDays : dayOrder;

    // Session columns = periods used (weekday + saturday as configured)
    const cols = periods.filter((p) =>
      sessions.some((s) => s.periodId === p.id || s.periodLabel === p.label)
    );
    const sessionDefs = (cols.length ? cols : periods).map((p) => ({
      key: p.id,
      label: p.label,
      startTime: p.startTime,
      endTime: p.endTime,
    }));

    const classIds = Array.from(new Set(sessions.map((s) => s.classId)));
    const dayBlocks = daysFinal.map((day) => {
      const matrix: Record<string, Record<string, string>> = {};
      for (const cid of classIds) {
        const cname = className(cid);
        matrix[cname] = {};
        for (const col of sessionDefs) {
          // Enforce display: at most one lesson per class per session
          const hits = sessions.filter(
            (s) =>
              s.classId === cid &&
              s.dayName === day &&
              (s.periodId === col.key || s.periodLabel === col.label)
          );
          if (hits[0]) {
            const subj = areaCode(hits[0].learningAreaId);
            const code = teacherCode(hits[0].teacherId);
            matrix[cname][col.key] = code ? `${subj}\n${code}` : subj;
          }
        }
      }
      return { dayLabel: day.toUpperCase(), matrix };
    });

    const week = weeks.find((w) => w.id === activeWeekId);
    const bytes = buildRemedialMatrixPdfBytes({
      schoolName: "School",
      title: "REMEDIAL LESSON TIMETABLE",
      subtitle: week
        ? `${week.name} · ${week.weekStart || ""} – ${week.weekEnd || ""}`
        : "Morning / Evening / Saturday",
      dayBlocks,
      sessions: sessionDefs,
      footer: `Chosen Time Tables · Remedial · ${new Date().toLocaleDateString()}`,
    });
    downloadPdf("remedial-timetable.pdf", bytes);
    toast.success("Professional remedial PDF downloaded");
  };

  const createWeek = async () => {
    if (!schoolId || !canEdit) return;
    if (!newWeekStart) {
      toast.error("Select week starting date");
      return;
    }
    const name =
      newWeekName.trim() ||
      `Remedial week of ${newWeekStart}`;
    // Duplicate week check
    const exists = weeks.find(
      (w) => w.weekStart === newWeekStart && w.status !== "archived"
    );
    if (exists) {
      const open = confirm(
        "A remedial timetable already exists for this week. Open it? (Cancel = create another version)"
      );
      if (open) {
        setActiveWeekId(exists.id);
        setShowNewWeek(false);
        load();
        return;
      }
    }
    setSaving(true);
    try {
      const ref = await addDoc(collection(db, "schools", schoolId, "remedialWeeks"), {
        schoolId,
        name,
        weekStart: newWeekStart,
        weekEnd: newWeekEnd || newWeekStart,
        status: "draft",
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
      setActiveWeekId(ref.id);
      setShowNewWeek(false);
      setNewWeekName("");
      setNewWeekStart("");
      setNewWeekEnd("");
      setRequests([]);
      setUnscheduled([]);
      toast.success("New weekly remedial timetable created");
      load();
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to create week");
    } finally {
      setSaving(false);
    }
  };

  const setWeekStatus = async (id: string, status: RemedialWeek["status"]) => {
    if (!schoolId || !canEdit) return;
    await setDoc(
      doc(db, "schools", schoolId, "remedialWeeks", id),
      { status, updatedAt: new Date().toISOString() },
      { merge: true }
    );
    toast.success(`Marked as ${status}`);
    load();
  };

  const deleteWeek = async (id: string) => {
    if (!schoolId || !canEdit) return;
    if (!confirm("Delete this weekly timetable and its sessions? This cannot be undone.")) return;
    const snap = await getDocs(collection(db, "schools", schoolId, "remedialTimetables"));
    const batch = writeBatch(db);
    snap.docs.forEach((d) => {
      if ((d.data() as { weekId?: string }).weekId === id) {
        batch.delete(d.ref);
      }
    });
    batch.delete(doc(db, "schools", schoolId, "remedialWeeks", id));
    await batch.commit();
    if (activeWeekId === id) setActiveWeekId("");
    toast.success("Week deleted");
    load();
  };

  if (!schoolId) {
    return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;
  }

  if (loading) {
    return <div className="text-center py-16 text-slate-500">Loading remedial…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Remedial Timetable</h1>
          <p className="text-sm text-slate-500">
            Weekly remedial plans · One lesson per class per session · No teacher double-booking
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => setShowNewWeek(true)}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-emerald-700 text-white text-sm"
          >
            <Plus className="w-4 h-4" /> New Remedial Timetable
          </button>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium"
          >
            <FileDown className="w-4 h-4" /> PDF
          </button>
        </div>

      {/* Weekly timetable switcher */}
      <div className="bg-white border rounded-xl p-4 space-y-3 text-sm">
        <div className="flex flex-wrap items-center gap-2 justify-between">
          <div>
            <span className="font-semibold text-slate-800">Current week: </span>
            {activeWeekId ? (
              <select
                className="border rounded-lg px-2 py-1 ml-1"
                value={activeWeekId}
                onChange={(e) => {
                  setActiveWeekId(e.target.value);
                }}
              >
                {weeks.map((w) => (
                  <option key={w.id} value={w.id}>
                    {w.name} ({w.weekStart}
                    {w.weekEnd && w.weekEnd !== w.weekStart ? `–${w.weekEnd}` : ""}) · {w.status}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-slate-500 ml-1">None — create a weekly timetable</span>
            )}
          </div>
          {activeWeekId && canEdit && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="px-2 py-1 border rounded text-xs"
                onClick={() => setWeekStatus(activeWeekId, "published")}
              >
                Publish
              </button>
              <button
                type="button"
                className="px-2 py-1 border rounded text-xs inline-flex items-center gap-1"
                onClick={() => setWeekStatus(activeWeekId, "archived")}
              >
                <Archive className="w-3 h-3" /> Archive
              </button>
            </div>
          )}
        </div>
        {showNewWeek && (
          <div className="border rounded-lg p-3 grid sm:grid-cols-4 gap-2 bg-slate-50">
            <input
              className="border rounded px-2 py-1.5"
              placeholder="Title e.g. Week 1 Maths focus"
              value={newWeekName}
              onChange={(e) => setNewWeekName(e.target.value)}
            />
            <input
              type="date"
              className="border rounded px-2 py-1.5"
              value={newWeekStart}
              onChange={(e) => setNewWeekStart(e.target.value)}
            />
            <input
              type="date"
              className="border rounded px-2 py-1.5"
              value={newWeekEnd}
              onChange={(e) => setNewWeekEnd(e.target.value)}
            />
            <div className="flex gap-2">
              <button type="button" className="px-3 py-1.5 bg-slate-900 text-white rounded" onClick={createWeek}>
                Create
              </button>
              <button type="button" className="px-3 py-1.5 border rounded" onClick={() => setShowNewWeek(false)}>
                Cancel
              </button>
            </div>
          </div>
        )}
        {weeks.length > 0 && (
          <div>
            <p className="text-xs font-medium text-slate-500 mb-1">Previous timetables</p>
            <ul className="text-xs space-y-1 max-h-28 overflow-y-auto">
              {weeks.map((w) => (
                <li key={w.id} className="flex flex-wrap gap-2 items-center justify-between border-b py-1">
                  <button
                    type="button"
                    className={`text-left ${w.id === activeWeekId ? "font-semibold" : ""}`}
                    onClick={() => setActiveWeekId(w.id)}
                  >
                    {w.name} · {w.weekStart} · <span className="uppercase text-slate-400">{w.status}</span>
                  </button>
                  {canEdit && (
                    <button type="button" className="text-red-600" onClick={() => deleteWeek(w.id)}>
                      Delete
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {unscheduled.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-sm">
          <p className="font-semibold text-amber-900 mb-1">Could not schedule ({unscheduled.length})</p>
          <ul className="list-disc pl-5 text-amber-800 space-y-0.5">
            {unscheduled.map((u, i) => (
              <li key={i}>{u}</li>
            ))}
          </ul>
          <p className="text-xs text-amber-700 mt-2">
            Tip: add more sessions, free the class slot, or mark more teacher availability — then Generate again.
          </p>
        </div>
      )}

      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {(
          [
            ["sessions", "Sessions"],
            ["periods", "Periods & days"],
            ["availability", "Teacher availability"],
            ["generate", "Generate"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              tab === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === "periods" && (
        <div className="bg-white border rounded-xl p-4 space-y-4">
          <h2 className="font-semibold">Remedial days</h2>
          <div className="flex flex-wrap gap-2">
            {ALL_DAYS.map((d) => (
              <label key={d} className="inline-flex items-center gap-2 text-sm border rounded-lg px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={days.includes(d)}
                  disabled={!canEdit}
                  onChange={() =>
                    setDays((prev) =>
                      prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d]
                    )
                  }
                />
                {d}
              </label>
            ))}
          </div>
          <h2 className="font-semibold pt-2">Remedial periods</h2>
          <p className="text-xs text-slate-500">
            Morning / Evening for weekdays. Saturday-only sessions for Saturday programmes.
          </p>
          <div className="space-y-2">
            {periods.map((p, idx) => (
              <div key={p.id} className="grid grid-cols-2 md:grid-cols-5 gap-2 items-center text-sm">
                <input
                  className="border rounded px-2 py-1"
                  value={p.label}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const next = [...periods];
                    next[idx] = { ...p, label: e.target.value };
                    setPeriods(next);
                  }}
                />
                <input
                  type="time"
                  className="border rounded px-2 py-1"
                  value={p.startTime}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const next = [...periods];
                    next[idx] = { ...p, startTime: e.target.value };
                    setPeriods(next);
                  }}
                />
                <input
                  type="time"
                  className="border rounded px-2 py-1"
                  value={p.endTime}
                  disabled={!canEdit}
                  onChange={(e) => {
                    const next = [...periods];
                    next[idx] = { ...p, endTime: e.target.value };
                    setPeriods(next);
                  }}
                />
                <label className="inline-flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={!!p.forSaturdayOnly}
                    disabled={!canEdit}
                    onChange={(e) => {
                      const next = [...periods];
                      next[idx] = { ...p, forSaturdayOnly: e.target.checked };
                      setPeriods(next);
                    }}
                  />
                  Saturday only
                </label>
                {canEdit && (
                  <button
                    type="button"
                    className="text-red-600 text-xs"
                    onClick={() => setPeriods(periods.filter((_, i) => i !== idx))}
                  >
                    Remove
                  </button>
                )}
              </div>
            ))}
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-1.5 border rounded-lg text-sm"
                onClick={() =>
                  setPeriods((prev) => [
                    ...prev,
                    {
                      id: `p${Date.now()}`,
                      label: "New session",
                      startTime: "08:00",
                      endTime: "09:00",
                      forSaturdayOnly: false,
                    },
                  ])
                }
              >
                <Plus className="w-3 h-3 inline" /> Add period
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={() => saveSettings({ days, periods })}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm"
              >
                <Save className="w-3 h-3" /> Save periods & days
              </button>
            </div>
          )}
        </div>
      )}

      {tab === "availability" && (
        <div className="bg-white border rounded-xl p-4 space-y-3 overflow-x-auto">
          <p className="text-sm text-slate-600">
            Teachers tick day + period they can take remedial. Used when you Generate.
          </p>
          <table className="w-full text-xs min-w-[640px]">
            <thead>
              <tr className="text-left border-b">
                <th className="py-2 pr-2">Teacher</th>
                <th className="py-2">In pool</th>
                {days.flatMap((d) =>
                  periodsForDay(d).map((p) => (
                    <th key={`${d}|${p.id}`} className="py-2 px-1 font-medium">
                      {d.slice(0, 3)} {p.label.slice(0, 6)}
                    </th>
                  ))
                )}
              </tr>
            </thead>
            <tbody>
              {teachers.map((t) => (
                <tr key={t.id} className="border-b">
                  <td className="py-1 pr-2 whitespace-nowrap">
                    {t.fullName} ({t.identifier})
                  </td>
                  <td className="py-1">
                    <input
                      type="checkbox"
                      checked={participating.includes(t.id)}
                      disabled={!canEdit}
                      onChange={() => toggleParticipating(t.id)}
                    />
                  </td>
                  {days.flatMap((d) =>
                    periodsForDay(d).map((p) => {
                      const key = `${d}|${p.id}`;
                      const on = (availability[t.id] || []).includes(key);
                      return (
                        <td key={key} className="py-1 px-1 text-center">
                          <input
                            type="checkbox"
                            checked={on}
                            disabled={!canEdit}
                            onChange={() => toggleAvail(t.id, d, p.id)}
                          />
                        </td>
                      );
                    })
                  )}
                </tr>
              ))}
            </tbody>
          </table>
          {canEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={() => saveSettings({ availability, participating, days, periods })}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm"
            >
              <Save className="w-3 h-3" /> Save availability
            </button>
          )}
        </div>
      )}

      {tab === "generate" && (
        <div className="bg-white border rounded-xl p-4 space-y-4">
          <p className="text-sm text-slate-600">
            Add class + subject needs, tick teachers under Availability, then Generate to assign randomly
            (respects ticks when set).
          </p>
          <div className="grid md:grid-cols-4 gap-2">
            <select
              className="border rounded px-2 py-1.5 text-sm"
              value={genClassId}
              onChange={(e) => setGenClassId(e.target.value)}
            >
              <option value="">Class</option>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <select
              className="border rounded px-2 py-1.5 text-sm"
              value={genAreaId}
              onChange={(e) => setGenAreaId(e.target.value)}
            >
              <option value="">Subject</option>
              {areas.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code || a.name}
                </option>
              ))}
            </select>
            <select
              className="border rounded px-2 py-1.5 text-sm"
              value={genDay}
              onChange={(e) => setGenDay(e.target.value)}
            >
              <option value="">All remedial days</option>
              {days.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
            <select
              className="border rounded px-2 py-1.5 text-sm"
              value={genPeriodId}
              onChange={(e) => setGenPeriodId(e.target.value)}
            >
              <option value="">All periods</option>
              {periods.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            className="px-3 py-1.5 border rounded-lg text-sm"
            onClick={() => {
              if (!genClassId || !genAreaId) {
                toast.error("Pick class and subject");
                return;
              }
              setRequests((r) => [
                ...r,
                {
                  classId: genClassId,
                  learningAreaId: genAreaId,
                  dayName: genDay || undefined,
                  periodId: genPeriodId || undefined,
                },
              ]);
            }}
          >
            Add request
          </button>
          <ul className="text-sm space-y-1">
            {requests.map((r, i) => (
              <li key={i} className="flex justify-between border rounded px-2 py-1">
                <span>
                  {className(r.classId)} · {areaCode(r.learningAreaId)}
                  {r.dayName ? ` · ${r.dayName}` : " · all days"}
                  {r.periodId ? ` · ${periods.find((p) => p.id === r.periodId)?.label}` : ""}
                </span>
                <button type="button" className="text-red-600" onClick={() => setRequests(requests.filter((_, j) => j !== i))}>
                  ×
                </button>
              </li>
            ))}
          </ul>
          {canEdit && (
            <button
              type="button"
              disabled={saving}
              onClick={handleGenerate}
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-700 text-white rounded-lg text-sm font-medium"
            >
              <Shuffle className="w-4 h-4" /> Generate assignments
            </button>
          )}
        </div>
      )}

      {tab === "sessions" && (
        <div className="space-y-3">
          {canEdit && (
            <button
              type="button"
              onClick={() => setShowForm((v) => !v)}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm"
            >
              <Plus className="w-4 h-4" /> Add session manually
            </button>
          )}
          {showForm && (
            <form onSubmit={handleAddSession} className="bg-white border rounded-xl p-4 grid md:grid-cols-3 gap-3 text-sm">
              <select className="border rounded px-2 py-1.5" value={classId} onChange={(e) => setClassId(e.target.value)} required>
                <option value="">Class</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
              <select className="border rounded px-2 py-1.5" value={learningAreaId} onChange={(e) => setLearningAreaId(e.target.value)} required>
                <option value="">Subject</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.code || a.name}</option>
                ))}
              </select>
              <select className="border rounded px-2 py-1.5" value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
                <option value="">Teacher</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName} ({t.identifier})</option>
                ))}
              </select>
              <select className="border rounded px-2 py-1.5" value={dayName} onChange={(e) => setDayName(e.target.value)}>
                {days.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
              <select className="border rounded px-2 py-1.5" value={periodId} onChange={(e) => setPeriodId(e.target.value)}>
                {periodsForDay(dayName).map((p) => (
                  <option key={p.id} value={p.id}>{p.label} ({p.startTime}-{p.endTime})</option>
                ))}
              </select>
              <button type="submit" disabled={saving} className="bg-slate-900 text-white rounded-lg px-3 py-1.5">
                Save session
              </button>
            </form>
          )}
          <div className="bg-white border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[640px]">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Day</th>
                  <th className="px-3 py-2">Period</th>
                  <th className="px-3 py-2">Class</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Teacher</th>
                  {canEdit && <th className="px-3 py-2 w-16" />}
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-3 py-8 text-center text-slate-500">
                      No remedial sessions yet. Add manually or use Generate.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => (
                    <tr key={s.id} className="border-t">
                      <td className="px-3 py-2">{s.dayName}</td>
                      <td className="px-3 py-2">
                        {s.periodLabel || s.periodId} ({s.startTime}-{s.endTime})
                      </td>
                      <td className="px-3 py-2">{className(s.classId)}</td>
                      <td className="px-3 py-2">{areaCode(s.learningAreaId)}</td>
                      <td className="px-3 py-2">{teacherCode(s.teacherId)}</td>
                      {canEdit && (
                        <td className="px-3 py-2">
                          <button type="button" onClick={() => handleDelete(s.id)} className="text-red-600">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
