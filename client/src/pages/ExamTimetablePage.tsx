/**
 * Exam timetable module — own exam periods (not main lesson periods).
 * Multi invigilator codes per session · Matrix landscape PDF.
 */

import { useEffect, useState } from "react";
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
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  listClasses,
  listLearningAreas,
  listTeachers,
} from "@/services/schoolService";
import type { SchoolClass, LearningArea, Teacher } from "@shared/types";
import { Plus, Trash2, FileDown, Save } from "lucide-react";
import { downloadPdf, buildExamMatrixPdfBytes } from "@/lib/exportUtils";
import { isFullAdmin } from "@/lib/roles";

interface ExamPeriod {
  id: string;
  label: string;
  startTime: string;
  endTime: string;
  displayOrder?: number;
}

interface ExamSession {
  id: string;
  schoolId: string;
  name: string;
  date: string;
  startTime: string;
  endTime: string;
  periodId?: string;
  /** Optional single class; empty = form-level via classIds or name only */
  classId?: string;
  /** Multiple streams/classes sitting same paper */
  classIds?: string[];
  learningAreaId: string;
  /** Multiple invigilator teacher ids (codes shown on PDF) */
  invigilatorIds?: string[];
  invigilatorId?: string; // legacy single
  room?: string;
  createdAt: string;
}

const DEFAULT_EXAM_PERIODS: ExamPeriod[] = [
  { id: "e1", label: "Session 1", startTime: "08:00", endTime: "10:00", displayOrder: 1 },
  { id: "e2", label: "Session 2", startTime: "11:00", endTime: "13:00", displayOrder: 2 },
  { id: "e3", label: "Session 3", startTime: "14:00", endTime: "16:00", displayOrder: 3 },
];

export default function ExamTimetablePage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const canEdit = isFullAdmin(schoolUser?.role);

  const [tab, setTab] = useState<"sessions" | "periods" | "preview">("sessions");
  const [sessions, setSessions] = useState<ExamSession[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [areas, setAreas] = useState<LearningArea[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [examPeriods, setExamPeriods] = useState<ExamPeriod[]>(DEFAULT_EXAM_PERIODS);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("");
  const [date, setDate] = useState("");
  const [periodId, setPeriodId] = useState("e1");
  const [selectedClassIds, setSelectedClassIds] = useState<string[]>([]);
  const [learningAreaId, setLearningAreaId] = useState("");
  const [invigilatorIds, setInvigilatorIds] = useState<string[]>([]);
  const [room, setRoom] = useState("");

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [sess, c, a, t, settings] = await Promise.all([
        getDocs(query(collection(db, "schools", schoolId, "examTimetables"), orderBy("date"))),
        listClasses(schoolId),
        listLearningAreas(schoolId),
        listTeachers(schoolId),
        getDoc(doc(db, "schools", schoolId, "settings", "exam")),
      ]);
      setSessions(sess.docs.map((d) => ({ id: d.id, ...d.data() } as ExamSession)));
      setClasses(c.filter((x) => x.active !== false));
      setAreas(a.filter((x) => x.active !== false));
      setTeachers(t.filter((x) => x.active !== false));
      if (settings.exists()) {
        const d = settings.data();
        if (Array.isArray(d?.periods) && d.periods.length) {
          setExamPeriods(d.periods as ExamPeriod[]);
        }
      }
    } catch {
      toast.error("Failed to load exam timetable");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId]);

  const areaCode = (id: string) => {
    const a = areas.find((x) => x.id === id);
    return (a?.code || a?.name || "").toString().slice(0, 10).toUpperCase();
  };
  const className = (id: string) => classes.find((c) => c.id === id)?.name || id;
  const teacherCode = (id: string) =>
    teachers.find((x) => x.id === id)?.identifier || "";

  const savePeriods = async () => {
    if (!schoolId || !canEdit) return;
    setSaving(true);
    try {
      await setDoc(
        doc(db, "schools", schoolId, "settings", "exam"),
        { schoolId, periods: examPeriods, updatedAt: new Date().toISOString() },
        { merge: true }
      );
      toast.success("Exam periods saved");
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !date || !learningAreaId) {
      toast.error("Date and subject required");
      return;
    }
    if (!selectedClassIds.length) {
      toast.error("Select at least one class / stream");
      return;
    }
    const p = examPeriods.find((x) => x.id === periodId);
    const startTime = p?.startTime || "08:00";
    const endTime = p?.endTime || "10:00";
    setSaving(true);
    try {
      await addDoc(collection(db, "schools", schoolId, "examTimetables"), {
        schoolId,
        name: name.trim() || areaCode(learningAreaId),
        date,
        startTime,
        endTime,
        periodId: p?.id || null,
        classId: selectedClassIds[0],
        classIds: selectedClassIds,
        learningAreaId,
        invigilatorIds,
        invigilatorId: invigilatorIds[0] || null,
        room: room.trim() || null,
        createdAt: new Date().toISOString(),
      });
      toast.success("Exam session added");
      setShowForm(false);
      setName("");
      setSelectedClassIds([]);
      setInvigilatorIds([]);
      setRoom("");
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!schoolId || !canEdit || !confirm("Delete exam session?")) return;
    await deleteDoc(doc(db, "schools", schoolId, "examTimetables", id));
    toast.success("Deleted");
    load();
  };

  const toggleClass = (id: string) => {
    setSelectedClassIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const toggleInv = (id: string) => {
    setInvigilatorIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );
  };

  const formOf = (name: string) => {
    const n = name.trim();
    const m = n.match(/^(Form\s*\d+|Grade\s*\d+|G\d+|F\d+)/i);
    if (m) return m[1].replace(/\s+/g, " ").toUpperCase();
    return n.replace(/\s+(East|West|North|South|[A-Z])$/i, "").trim().toUpperCase() || n.toUpperCase();
  };

  const dayLabelOf = (date: string) => {
    try {
      return new Date(date + "T12:00:00").toLocaleDateString("en-GB", {
        weekday: "long",
        day: "numeric",
        month: "long",
        year: "numeric",
      });
    } catch {
      return date;
    }
  };

  /** Build professional day × class × session matrix for preview + PDF */
  const buildExamMatrix = () => {
    const orderedPeriods = [...examPeriods].sort(
      (a, b) => (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.startTime.localeCompare(b.startTime)
    );
    const sessionDefs = orderedPeriods.map((p) => ({
      key: p.id,
      label: p.label,
      startTime: p.startTime,
      endTime: p.endTime,
    }));

    // Group by date
    const dates = Array.from(new Set(sessions.map((s) => s.date))).sort();
    const formSet = new Set<string>();
    for (const s of sessions) {
      const ids = s.classIds?.length ? s.classIds : s.classId ? [s.classId] : [];
      ids.forEach((id) => formSet.add(formOf(className(id))));
    }
    const forms = Array.from(formSet).sort();

    const dayBlocks = dates.map((date) => {
      const matrix: Record<string, Record<string, string>> = {};
      for (const form of forms) matrix[form] = {};
      const daySessions = sessions.filter((s) => s.date === date);
      for (const s of daySessions) {
        const ids = s.classIds?.length ? s.classIds : s.classId ? [s.classId] : [];
        const formsHit = Array.from(new Set(ids.map((id) => formOf(className(id)))));
        // Match session column by periodId or by time
        let sk =
          s.periodId && orderedPeriods.some((p) => p.id === s.periodId)
            ? s.periodId
            : orderedPeriods.find((p) => p.startTime === s.startTime && p.endTime === s.endTime)?.id ||
              orderedPeriods.find((p) => p.startTime === s.startTime)?.id ||
              orderedPeriods[0]?.id;
        if (!sk) continue;
        const subj = (areaCode(s.learningAreaId) || s.name || "").toUpperCase();
        const inv =
          s.invigilatorIds?.length
            ? s.invigilatorIds
            : s.invigilatorId
              ? [s.invigilatorId]
              : [];
        const codes = inv.map(teacherCode).filter(Boolean).join(", ");
        const cell = codes ? `${subj}\n${codes}` : subj;
        for (const form of formsHit) {
          // Merge codes if same form+session already has subject
          const prev = matrix[form][sk];
          if (prev) {
            const [ps, ...pc] = prev.split("\n");
            if (ps === subj) {
              const all = new Set(
                [...pc.join(" ").split(","), ...codes.split(",")].map((x) => x.trim()).filter(Boolean)
              );
              matrix[form][sk] = `${subj}\n${Array.from(all).join(", ")}`;
            } else {
              matrix[form][sk] = prev + " / " + cell;
            }
          } else {
            matrix[form][sk] = cell;
          }
        }
      }
      return { dayLabel: dayLabelOf(date), date, matrix };
    });

    return { sessionDefs, dayBlocks, forms };
  };

  const handleExportPdf = () => {
    if (!sessions.length) {
      toast.error("No exam sessions — add examinations first");
      return;
    }
    const { sessionDefs, dayBlocks } = buildExamMatrix();
    const bytes = buildExamMatrixPdfBytes({
      schoolName: "School",
      title: "END-OF-TERM EXAMINATION TIMETABLE",
      subtitle: "Landscape · Class levels · Sessions · Subject + invigilator codes",
      dayBlocks,
      sessions: sessionDefs,
      sessionColumns: [],
      rows: [],
      footer: `Chosen Time Tables · Exam · ${new Date().toLocaleDateString()}`,
    });
    downloadPdf("exam-timetable.pdf", bytes);
    toast.success("Professional exam timetable PDF downloaded");
  };

  if (!schoolId) {
    return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;
  }
  if (loading) {
    return <div className="text-center py-16 text-slate-500">Loading exams…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Exam Timetable</h1>
          <p className="text-sm text-slate-500">
            Own exam periods · Multiple invigilator codes · Landscape table PDF
          </p>
        </div>
        <button
          type="button"
          onClick={handleExportPdf}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium"
        >
          <FileDown className="w-4 h-4" /> Generate PDF
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b pb-2">
        {(
          [
            ["sessions", "Examinations"],
            ["periods", "Exam sessions (times)"],
            ["preview", "Preview timetable"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            onClick={() => setTab(k)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              tab === k ? "bg-slate-900 text-white" : "bg-slate-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      
      {tab === "preview" && (
        <div className="space-y-6">
          <p className="text-sm text-slate-600">
            On-screen preview of the landscape exam timetable (class levels × sessions). Empty cells mean no exam.
          </p>
          {sessions.length === 0 ? (
            <p className="text-slate-500 text-sm">Add examinations first.</p>
          ) : (
            (() => {
              const { sessionDefs, dayBlocks } = buildExamMatrix();
              return dayBlocks.map((block) => (
                <div key={block.date} className="bg-white border rounded-xl overflow-x-auto">
                  <h3 className="font-bold px-4 py-2 border-b bg-slate-50 text-sm uppercase tracking-wide">
                    {block.dayLabel}
                  </h3>
                  <table className="w-full text-sm min-w-[640px] border-collapse">
                    <thead>
                      <tr className="bg-slate-100">
                        <th className="border px-2 py-2 text-left font-semibold">Class</th>
                        {sessionDefs.map((s) => (
                          <th key={s.key} className="border px-2 py-2 text-center font-semibold">
                            <div>{s.label}</div>
                            <div className="text-xs font-normal text-slate-600">
                              {s.startTime}–{s.endTime}
                            </div>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {Object.keys(block.matrix)
                        .sort()
                        .map((form) => (
                          <tr key={form}>
                            <td className="border px-2 py-2 font-semibold whitespace-nowrap">{form}</td>
                            {sessionDefs.map((s) => {
                              const cell = block.matrix[form]?.[s.key] || "";
                              const [subj, ...rest] = cell.split("\n");
                              const codes = rest.join(" ");
                              return (
                                <td key={s.key} className="border px-2 py-3 text-center align-middle">
                                  {subj ? (
                                    <>
                                      <div className="font-bold text-slate-900 tracking-wide">{subj}</div>
                                      {codes ? (
                                        <div className="text-xs text-slate-600 mt-0.5">{codes}</div>
                                      ) : null}
                                    </>
                                  ) : (
                                    <span className="text-slate-200">·</span>
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                    </tbody>
                  </table>
                </div>
              ));
            })()
          )}
          <button
            type="button"
            onClick={handleExportPdf}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-slate-900 text-white text-sm"
          >
            <FileDown className="w-4 h-4" /> Export landscape PDF
          </button>
        </div>
      )}

{tab === "periods" && (
        <div className="bg-white border rounded-xl p-4 space-y-3">
          <p className="text-sm text-slate-600">
            Configure as many exam sessions as you need (not hardcoded). Times apply only to exams — not main lesson periods.
          </p>
          {examPeriods.map((p, idx) => (
            <div key={p.id} className="grid grid-cols-2 md:grid-cols-4 gap-2 text-sm">
              <input
                className="border rounded px-2 py-1"
                value={p.label}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = [...examPeriods];
                  next[idx] = { ...p, label: e.target.value };
                  setExamPeriods(next);
                }}
              />
              <input
                type="time"
                className="border rounded px-2 py-1"
                value={p.startTime}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = [...examPeriods];
                  next[idx] = { ...p, startTime: e.target.value };
                  setExamPeriods(next);
                }}
              />
              <input
                type="time"
                className="border rounded px-2 py-1"
                value={p.endTime}
                disabled={!canEdit}
                onChange={(e) => {
                  const next = [...examPeriods];
                  next[idx] = { ...p, endTime: e.target.value };
                  setExamPeriods(next);
                }}
              />
              {canEdit && (
                <button
                  type="button"
                  className="text-red-600 text-xs"
                  onClick={() => setExamPeriods(examPeriods.filter((_, i) => i !== idx))}
                >
                  Remove
                </button>
              )}
            </div>
          ))}
          {canEdit && (
            <div className="flex gap-2">
              <button
                type="button"
                className="px-3 py-1.5 border rounded-lg text-sm"
                onClick={() =>
                  setExamPeriods((prev) => [
                    ...prev,
                    {
                      id: `e${Date.now()}`,
                      label: "New paper",
                      startTime: "08:00",
                      endTime: "10:00",
                    },
                  ])
                }
              >
                <Plus className="w-3 h-3 inline" /> Add exam period
              </button>
              <button
                type="button"
                disabled={saving}
                onClick={savePeriods}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-slate-900 text-white rounded-lg text-sm"
              >
                <Save className="w-3 h-3" /> Save exam periods
              </button>
            </div>
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
              <Plus className="w-4 h-4" /> Add exam session
            </button>
          )}
          {showForm && (
            <form onSubmit={handleCreate} className="bg-white border rounded-xl p-4 space-y-3 text-sm">
              <div className="grid md:grid-cols-3 gap-3">
                <input
                  className="border rounded px-2 py-1.5"
                  placeholder="Paper name (optional)"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
                <input
                  type="date"
                  className="border rounded px-2 py-1.5"
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  required
                />
                <select
                  className="border rounded px-2 py-1.5"
                  value={periodId}
                  onChange={(e) => setPeriodId(e.target.value)}
                >
                  {examPeriods.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.label} ({p.startTime}-{p.endTime})
                    </option>
                  ))}
                </select>
                <select
                  className="border rounded px-2 py-1.5"
                  value={learningAreaId}
                  onChange={(e) => setLearningAreaId(e.target.value)}
                  required
                >
                  <option value="">Subject</option>
                  {areas.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.code || a.name}
                    </option>
                  ))}
                </select>
                <input
                  className="border rounded px-2 py-1.5"
                  placeholder="Room (optional)"
                  value={room}
                  onChange={(e) => setRoom(e.target.value)}
                />
              </div>
              <div>
                <p className="font-medium mb-1">Classes / streams (same paper)</p>
                <div className="flex flex-wrap gap-2">
                  {classes.map((c) => (
                    <label key={c.id} className="inline-flex items-center gap-1 border rounded px-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={selectedClassIds.includes(c.id)}
                        onChange={() => toggleClass(c.id)}
                      />
                      {c.name}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="font-medium mb-1">Invigilator codes (multiple)</p>
                <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto">
                  {teachers.map((t) => (
                    <label key={t.id} className="inline-flex items-center gap-1 border rounded px-2 py-1 text-xs">
                      <input
                        type="checkbox"
                        checked={invigilatorIds.includes(t.id)}
                        onChange={() => toggleInv(t.id)}
                      />
                      {t.identifier || t.fullName}
                    </label>
                  ))}
                </div>
              </div>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg"
              >
                Save exam session
              </button>
            </form>
          )}

          <div className="bg-white border rounded-xl overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="bg-slate-50 text-left">
                <tr>
                  <th className="px-3 py-2">Date</th>
                  <th className="px-3 py-2">Time</th>
                  <th className="px-3 py-2">Subject</th>
                  <th className="px-3 py-2">Classes</th>
                  <th className="px-3 py-2">Invigilators</th>
                  <th className="px-3 py-2">Room</th>
                  {canEdit && <th className="px-3 py-2 w-12" />}
                </tr>
              </thead>
              <tbody>
                {sessions.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="px-3 py-8 text-center text-slate-500">
                      No exam sessions yet.
                    </td>
                  </tr>
                ) : (
                  sessions.map((s) => {
                    const ids = s.classIds?.length ? s.classIds : s.classId ? [s.classId] : [];
                    const inv =
                      s.invigilatorIds?.length
                        ? s.invigilatorIds
                        : s.invigilatorId
                          ? [s.invigilatorId]
                          : [];
                    return (
                      <tr key={s.id} className="border-t">
                        <td className="px-3 py-2">{s.date}</td>
                        <td className="px-3 py-2">
                          {s.startTime}–{s.endTime}
                        </td>
                        <td className="px-3 py-2 font-medium">
                          {areaCode(s.learningAreaId) || s.name}
                        </td>
                        <td className="px-3 py-2">
                          {ids.map(className).join(", ")}
                        </td>
                        <td className="px-3 py-2">
                          {inv.map(teacherCode).filter(Boolean).join(", ") || "—"}
                        </td>
                        <td className="px-3 py-2">{s.room || "—"}</td>
                        {canEdit && (
                          <td className="px-3 py-2">
                            <button type="button" onClick={() => handleDelete(s.id)} className="text-red-600">
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </td>
                        )}
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
