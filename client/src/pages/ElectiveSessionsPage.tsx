/**
 * Shared joint elective lessons — multiple streams, multiple subjects, one period.
 * Teacher codes only (not mapped to subjects). No mandatory classroom.
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
  updateDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  listClasses,
  listLearningAreas,
  listPeriods,
  listTeachers,
} from "@/services/schoolService";
import type { SchoolClass, LearningArea, Period, Teacher, ElectiveSession } from "@shared/types";
import { Plus, Trash2, Save, Pencil } from "lucide-react";
import { isFullAdmin } from "@/lib/roles";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

export default function ElectiveSessionsPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const canEdit = isFullAdmin(schoolUser?.role);

  const [items, setItems] = useState<ElectiveSession[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [areas, setAreas] = useState<LearningArea[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState("Form 3 Electives");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [learningAreaIds, setLearningAreaIds] = useState<string[]>([]);
  const [teacherCodes, setTeacherCodes] = useState<string[]>([]);
  const [dayName, setDayName] = useState("Monday");
  const [periodNumber, setPeriodNumber] = useState<number>(1);
  const [codeInput, setCodeInput] = useState("");

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [snap, c, a, p, t] = await Promise.all([
        getDocs(query(collection(db, "schools", schoolId, "electiveSessions"), orderBy("name"))),
        listClasses(schoolId),
        listLearningAreas(schoolId),
        listPeriods(schoolId),
        listTeachers(schoolId),
      ]);
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as ElectiveSession)));
      setClasses(c.filter((x) => x.active !== false));
      setAreas(a.filter((x) => x.active !== false));
      const lessonPs = p
        .filter((x) => x.kind === "lesson")
        .sort((x, y) => x.displayOrder - y.displayOrder);
      setPeriods(lessonPs);
      if (lessonPs.length && !lessonPs.some((x) => x.periodNumber === periodNumber)) {
        setPeriodNumber(lessonPs[0].periodNumber);
      }
      setTeachers(t.filter((x) => x.active !== false));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load elective sessions");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId]);

  const resetForm = () => {
    setEditingId(null);
    setName("Form 3 Electives");
    setClassIds([]);
    setLearningAreaIds([]);
    setTeacherCodes([]);
    setDayName("Monday");
    setCodeInput("");
    if (periods[0]) setPeriodNumber(periods[0].periodNumber);
  };

  const startEdit = (s: ElectiveSession) => {
    setEditingId(s.id);
    setName(s.name);
    setClassIds(s.classIds || []);
    setLearningAreaIds(s.learningAreaIds || []);
    setTeacherCodes(s.teacherCodes || []);
    setDayName(s.dayName);
    setPeriodNumber(s.periodNumber);
    setShowForm(true);
  };

  const toggle = (list: string[], id: string, set: (v: string[]) => void) => {
    set(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const addCode = () => {
    const c = codeInput.trim().toUpperCase();
    if (!c) return;
    if (!teacherCodes.includes(c)) setTeacherCodes([...teacherCodes, c]);
    setCodeInput("");
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !canEdit) return;
    if (!name.trim()) {
      toast.error("Enter a name for this elective lesson");
      return;
    }
    if (classIds.length < 1) {
      toast.error("Select at least one stream / class");
      return;
    }
    if (learningAreaIds.length < 1) {
      toast.error("Select at least one elective subject");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        schoolId,
        name: name.trim(),
        classIds,
        learningAreaIds,
        teacherCodes,
        dayName,
        periodNumber,
        updatedAt: new Date().toISOString(),
      };
      if (editingId) {
        await updateDoc(doc(db, "schools", schoolId, "electiveSessions", editingId), payload);
        toast.success("Elective lesson updated — appears on all selected streams");
      } else {
        await addDoc(collection(db, "schools", schoolId, "electiveSessions"), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
        toast.success("Elective lesson created");
      }
      setShowForm(false);
      resetForm();
      load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!schoolId || !canEdit || !confirm("Delete this shared elective lesson from all streams?")) return;
    await deleteDoc(doc(db, "schools", schoolId, "electiveSessions", id));
    toast.success("Deleted");
    load();
  };

  const className = (id: string) => classes.find((c) => c.id === id)?.name || id;
  const areaCode = (id: string) => {
    const a = areas.find((x) => x.id === id);
    return (a?.code || a?.name || id).toString().toUpperCase();
  };
  const periodLabel = (n: number) => {
    const p = periods.find((x) => x.periodNumber === n);
    return p ? `${p.label || "P" + n} (${p.startTime}-${p.endTime})` : `Period ${n}`;
  };

  if (!schoolId) {
    return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;
  }
  if (loading) {
    return <div className="text-center py-16 text-slate-500">Loading…</div>;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Joint Electives</h1>
          <p className="text-sm text-slate-500">
            One shared lesson for several streams · subjects stack in the same cell · teacher codes only
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm((v) => !v);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm"
          >
            <Plus className="w-4 h-4" /> New elective lesson
          </button>
        )}
      </div>

      {showForm && canEdit && (
        <form onSubmit={handleSave} className="bg-white border rounded-xl p-5 space-y-4 text-sm">
          <h2 className="font-semibold">{editingId ? "Edit" : "Create"} shared elective lesson</h2>

          <div>
            <label className="block font-medium mb-1">Elective lesson name</label>
            <input
              className="w-full border rounded-lg px-3 py-2"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Form 3 Electives"
              required
            />
          </div>

          <div>
            <label className="block font-medium mb-1">Participating streams</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border rounded-lg p-2">
              {classes.map((c) => (
                <label key={c.id} className="inline-flex items-center gap-1 border rounded px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={classIds.includes(c.id)}
                    onChange={() => toggle(classIds, c.id, setClassIds)}
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Elective subjects (taught at the same time)</label>
            <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto border rounded-lg p-2">
              {areas.map((a) => (
                <label key={a.id} className="inline-flex items-center gap-1 border rounded px-2 py-1 text-xs">
                  <input
                    type="checkbox"
                    checked={learningAreaIds.includes(a.id)}
                    onChange={() => toggle(learningAreaIds, a.id, setLearningAreaIds)}
                  />
                  {a.code || a.name}
                </label>
              ))}
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Teacher codes (not linked to a subject)</label>
            <div className="flex gap-2">
              <input
                className="border rounded-lg px-3 py-2 flex-1"
                value={codeInput}
                onChange={(e) => setCodeInput(e.target.value)}
                placeholder="e.g. T014"
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    addCode();
                  }
                }}
              />
              <button type="button" onClick={addCode} className="px-3 py-2 border rounded-lg">
                Add
              </button>
            </div>
            <div className="flex flex-wrap gap-1 mt-2">
              {teachers.slice(0, 12).map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className="text-xs border rounded px-2 py-0.5 hover:bg-slate-50"
                  onClick={() => {
                    const c = (t.identifier || "").toUpperCase();
                    if (c && !teacherCodes.includes(c)) setTeacherCodes([...teacherCodes, c]);
                  }}
                >
                  + {t.identifier}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-2 mt-2">
              {teacherCodes.map((c) => (
                <span key={c} className="inline-flex items-center gap-1 bg-slate-100 rounded px-2 py-0.5 text-xs">
                  {c}
                  <button type="button" className="text-red-600" onClick={() => setTeacherCodes(teacherCodes.filter((x) => x !== c))}>
                    ×
                  </button>
                </span>
              ))}
            </div>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Day</label>
              <select className="w-full border rounded-lg px-3 py-2" value={dayName} onChange={(e) => setDayName(e.target.value)}>
                {DAYS.map((d) => (
                  <option key={d} value={d}>{d}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Period (from school periods)</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={periodNumber}
                onChange={(e) => setPeriodNumber(Number(e.target.value))}
              >
                {periods.map((p) => (
                  <option key={p.id} value={p.periodNumber}>
                    {p.label || `P${p.periodNumber}`} ({p.startTime}-{p.endTime})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <p className="text-xs text-slate-500">
            No classroom is required. Teachers decide where each elective group meets.
          </p>

          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-1 px-4 py-2 bg-slate-900 text-white rounded-lg"
            >
              <Save className="w-4 h-4" /> {editingId ? "Save changes" : "Create elective lesson"}
            </button>
            <button type="button" className="px-4 py-2 border rounded-lg" onClick={() => { setShowForm(false); resetForm(); }}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Name</th>
              <th className="px-3 py-2">Streams</th>
              <th className="px-3 py-2">Subjects</th>
              <th className="px-3 py-2">Teachers</th>
              <th className="px-3 py-2">When</th>
              {canEdit && <th className="px-3 py-2 w-24" />}
            </tr>
          </thead>
          <tbody>
            {items.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-slate-500">
                  No joint electives yet. Create one so subjects stack in one cell on every selected stream.
                </td>
              </tr>
            ) : (
              items.map((s) => (
                <tr key={s.id} className="border-t">
                  <td className="px-3 py-2 font-medium">{s.name}</td>
                  <td className="px-3 py-2 text-xs">{(s.classIds || []).map(className).join(", ")}</td>
                  <td className="px-3 py-2 text-xs font-semibold">
                    {(s.learningAreaIds || []).map(areaCode).join(" · ")}
                  </td>
                  <td className="px-3 py-2 text-xs">{(s.teacherCodes || []).join(", ") || "—"}</td>
                  <td className="px-3 py-2 text-xs">
                    {s.dayName} · {periodLabel(s.periodNumber)}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEdit(s)} className="text-slate-700">
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button type="button" onClick={() => handleDelete(s.id)} className="text-red-600">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-slate-500">
        After creating electives, open <strong>Timetables → Generate</strong>. The shared lesson is locked onto every selected stream at that day and period; subjects appear stacked in one cell.
      </p>
    </div>
  );
}
