/**
 * Joint Class Management — organize students from multiple streams into
 * one subject group. Does NOT create timetable entries (electives do that).
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
  updateDoc,
  query,
  orderBy,
} from "firebase/firestore";
import { db } from "@/lib/firebase";
import {
  listClasses,
  listLearningAreas,
  listTeachers,
} from "@/services/schoolService";
import type {
  SchoolClass,
  LearningArea,
  Teacher,
  JointClass,
  JointClassMember,
  ElectiveSession,
} from "@shared/types";
import { Plus, Trash2, Save, Pencil, Users, X } from "lucide-react";
import { isFullAdmin } from "@/lib/roles";

const LEVELS = ["Form 1", "Form 2", "Form 3", "Form 4", "Grade 7", "Grade 8", "Grade 9", "Grade 10", "Other"];

function newMemberId() {
  return `m_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

export default function JointClassesPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const canEdit = isFullAdmin(schoolUser?.role);

  const [items, setItems] = useState<JointClass[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [areas, setAreas] = useState<LearningArea[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [electives, setElectives] = useState<ElectiveSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const [filterLevel, setFilterLevel] = useState("");
  const [filterSubject, setFilterSubject] = useState("");
  const [search, setSearch] = useState("");

  // form
  const [name, setName] = useState("");
  const [classLevel, setClassLevel] = useState("Form 3");
  const [learningAreaId, setLearningAreaId] = useState("");
  const [classIds, setClassIds] = useState<string[]>([]);
  const [members, setMembers] = useState<JointClassMember[]>([]);
  const [electiveSessionId, setElectiveSessionId] = useState("");
  const [teacherId, setTeacherId] = useState("");
  const [teacherCode, setTeacherCode] = useState("");
  const [room, setRoom] = useState("");
  const [notes, setNotes] = useState("");

  // add member
  const [memberStream, setMemberStream] = useState("");
  const [memberName, setMemberName] = useState("");
  const [memberAdm, setMemberAdm] = useState("");

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [snap, c, a, t, el] = await Promise.all([
        getDocs(query(collection(db, "schools", schoolId, "jointClasses"), orderBy("name"))),
        listClasses(schoolId),
        listLearningAreas(schoolId),
        listTeachers(schoolId),
        getDocs(collection(db, "schools", schoolId, "electiveSessions")),
      ]);
      setItems(snap.docs.map((d) => ({ id: d.id, ...d.data() } as JointClass)));
      setClasses(c.filter((x) => x.active !== false));
      setAreas(a.filter((x) => x.active !== false));
      setTeachers(t.filter((x) => x.active !== false));
      setElectives(el.docs.map((d) => ({ id: d.id, ...d.data() } as ElectiveSession)));
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Failed to load joint classes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId]);

  const streamsForLevel = useMemo(() => {
    const lv = classLevel.toLowerCase().replace(/\s+/g, "");
    return classes.filter((c) => {
      const n = (c.name || "").toLowerCase().replace(/\s+/g, "");
      if (classLevel === "Other") return true;
      return n.includes(lv) || n.includes(lv.replace("form", "f")) || n.includes(lv.replace("grade", "g"));
    });
  }, [classes, classLevel]);

  const areaName = (id: string) => {
    const a = areas.find((x) => x.id === id);
    return a ? `${a.name}${a.code ? ` (${a.code})` : ""}` : id;
  };
  const className = (id: string) => classes.find((c) => c.id === id)?.name || id;

  const suggestName = () => {
    const a = areas.find((x) => x.id === learningAreaId);
    const subj = a?.name || "Subject";
    setName(`${classLevel} ${subj} Joint Class`);
  };

  const resetForm = () => {
    setEditingId(null);
    setName("");
    setClassLevel("Form 3");
    setLearningAreaId("");
    setClassIds([]);
    setMembers([]);
    setElectiveSessionId("");
    setTeacherId("");
    setTeacherCode("");
    setRoom("");
    setNotes("");
    setMemberStream("");
    setMemberName("");
    setMemberAdm("");
  };

  const startEdit = (j: JointClass) => {
    setEditingId(j.id);
    setName(j.name);
    setClassLevel(j.classLevel || "Form 3");
    setLearningAreaId(j.learningAreaId);
    setClassIds(j.classIds || []);
    setMembers(j.members || []);
    setElectiveSessionId(j.electiveSessionId || "");
    setTeacherId(j.teacherId || "");
    setTeacherCode(j.teacherCode || "");
    setRoom(j.room || "");
    setNotes(j.notes || "");
    setShowForm(true);
    setDetailId(null);
  };

  const toggleStream = (id: string) => {
    setClassIds((prev) => {
      if (prev.includes(id)) {
        // remove members from that stream
        setMembers((m) => m.filter((x) => x.classId !== id));
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
  };

  const addMember = () => {
    const stream = memberStream || classIds[0];
    const fullName = memberName.trim();
    if (!stream) {
      toast.error("Select a stream for the student");
      return;
    }
    if (!classIds.includes(stream)) {
      toast.error("Stream must be a participating stream");
      return;
    }
    if (!fullName) {
      toast.error("Enter the student name");
      return;
    }
    const key = fullName.toLowerCase();
    if (members.some((m) => m.classId === stream && m.fullName.toLowerCase() === key)) {
      toast.error("This student is already in the joint class");
      return;
    }
    setMembers((prev) => [
      ...prev,
      {
        id: newMemberId(),
        classId: stream,
        fullName,
        admissionNo: memberAdm.trim() || undefined,
      },
    ]);
    setMemberName("");
    setMemberAdm("");
  };

  const removeMember = (id: string) => setMembers((m) => m.filter((x) => x.id !== id));

  const countByStream = (list: JointClassMember[], streamIds: string[]) => {
    const map: Record<string, number> = {};
    for (const sid of streamIds) map[sid] = 0;
    for (const m of list) {
      map[m.classId] = (map[m.classId] || 0) + 1;
    }
    return map;
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !canEdit) return;
    if (!name.trim()) {
      toast.error("Enter a joint class name");
      return;
    }
    if (!learningAreaId) {
      toast.error("Select a subject");
      return;
    }
    if (classIds.length < 1) {
      toast.error("Select at least one participating stream");
      return;
    }
    // members must belong to selected streams
    const bad = members.filter((m) => !classIds.includes(m.classId));
    if (bad.length) {
      toast.error("Some students belong to streams not selected — remove them or add the stream");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        schoolId,
        name: name.trim(),
        classLevel,
        learningAreaId,
        classIds,
        members,
        electiveSessionId: electiveSessionId || null,
        teacherId: teacherId || null,
        teacherCode: teacherCode.trim() || teachers.find((t) => t.id === teacherId)?.identifier || null,
        room: room.trim() || null,
        notes: notes.trim() || null,
        updatedAt: new Date().toISOString(),
      };
      if (editingId) {
        await updateDoc(doc(db, "schools", schoolId, "jointClasses", editingId), payload);
        toast.success("Joint class updated");
      } else {
        await addDoc(collection(db, "schools", schoolId, "jointClasses"), {
          ...payload,
          createdAt: new Date().toISOString(),
        });
        toast.success("Joint class created");
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
    if (!schoolId || !canEdit) return;
    if (!confirm("Delete this joint class? The shared elective lesson (if any) will NOT be deleted.")) return;
    await deleteDoc(doc(db, "schools", schoolId, "jointClasses", id));
    toast.success("Joint class deleted");
    if (detailId === id) setDetailId(null);
    load();
  };

  const filtered = items.filter((j) => {
    if (filterLevel && j.classLevel !== filterLevel) return false;
    if (filterSubject && j.learningAreaId !== filterSubject) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      if (!j.name.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const detail = detailId ? items.find((x) => x.id === detailId) : null;

  if (!schoolId) {
    return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;
  }
  if (loading) {
    return <div className="text-center py-16 text-slate-500">Loading joint classes…</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Joint Class Management</h1>
          <p className="text-sm text-slate-500">
            Combine students from several streams for one subject. Does not change the timetable — use{" "}
            <strong>Joint Electives</strong> for the shared period display.
          </p>
        </div>
        {canEdit && (
          <button
            type="button"
            onClick={() => {
              resetForm();
              setShowForm(true);
              setDetailId(null);
            }}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-900 text-white text-sm"
          >
            <Plus className="w-4 h-4" /> New joint class
          </button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <input
          className="border rounded-lg px-3 py-1.5 text-sm"
          placeholder="Search name…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <select className="border rounded-lg px-2 py-1.5 text-sm" value={filterLevel} onChange={(e) => setFilterLevel(e.target.value)}>
          <option value="">All levels</option>
          {LEVELS.map((l) => (
            <option key={l} value={l}>{l}</option>
          ))}
        </select>
        <select className="border rounded-lg px-2 py-1.5 text-sm" value={filterSubject} onChange={(e) => setFilterSubject(e.target.value)}>
          <option value="">All subjects</option>
          {areas.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </select>
      </div>

      {showForm && canEdit && (
        <form onSubmit={handleSave} className="bg-white border rounded-xl p-5 space-y-4 text-sm">
          <div className="flex justify-between items-center">
            <h2 className="font-semibold">{editingId ? "Edit joint class" : "Create joint class"}</h2>
            <button type="button" onClick={() => { setShowForm(false); resetForm(); }}>
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid sm:grid-cols-2 gap-3">
            <div>
              <label className="block font-medium mb-1">Class level</label>
              <select className="w-full border rounded-lg px-3 py-2" value={classLevel} onChange={(e) => setClassLevel(e.target.value)}>
                {LEVELS.map((l) => (
                  <option key={l} value={l}>{l}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Subject</label>
              <select
                className="w-full border rounded-lg px-3 py-2"
                value={learningAreaId}
                onChange={(e) => setLearningAreaId(e.target.value)}
                required
              >
                <option value="">Select…</option>
                {areas.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Joint class name</label>
            <div className="flex gap-2">
              <input
                className="flex-1 border rounded-lg px-3 py-2"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Form 3 Computer Studies Joint Class"
                required
              />
              <button type="button" className="px-3 py-2 border rounded-lg text-xs" onClick={suggestName}>
                Suggest
              </button>
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Participating streams ({classLevel})</label>
            <div className="flex flex-wrap gap-2 border rounded-lg p-2 max-h-28 overflow-y-auto">
              {(streamsForLevel.length ? streamsForLevel : classes).map((c) => (
                <label key={c.id} className="inline-flex items-center gap-1 border rounded px-2 py-1 text-xs">
                  <input type="checkbox" checked={classIds.includes(c.id)} onChange={() => toggleStream(c.id)} />
                  {c.name}
                </label>
              ))}
            </div>
          </div>

          {/* Members */}
          <div className="border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2 font-medium">
              <Users className="w-4 h-4" /> Student membership
              <span className="text-slate-500 font-normal">({members.length} total)</span>
            </div>
            <div className="grid sm:grid-cols-4 gap-2">
              <select className="border rounded px-2 py-1.5" value={memberStream} onChange={(e) => setMemberStream(e.target.value)}>
                <option value="">Stream…</option>
                {classIds.map((id) => (
                  <option key={id} value={id}>{className(id)}</option>
                ))}
              </select>
              <input className="border rounded px-2 py-1.5" placeholder="Student name" value={memberName} onChange={(e) => setMemberName(e.target.value)} />
              <input className="border rounded px-2 py-1.5" placeholder="Adm no (optional)" value={memberAdm} onChange={(e) => setMemberAdm(e.target.value)} />
              <button type="button" onClick={addMember} className="border rounded px-2 py-1.5 bg-slate-50">
                Add student
              </button>
            </div>
            <div className="text-xs text-slate-600 grid sm:grid-cols-2 gap-2">
              {classIds.map((sid) => {
                const n = members.filter((m) => m.classId === sid).length;
                return (
                  <div key={sid} className="border rounded p-2">
                    <p className="font-medium">{className(sid)} — {n}</p>
                    <ul className="mt-1 max-h-24 overflow-y-auto">
                      {members
                        .filter((m) => m.classId === sid)
                        .map((m) => (
                          <li key={m.id} className="flex justify-between gap-2">
                            <span>
                              {m.fullName}
                              {m.admissionNo ? ` (${m.admissionNo})` : ""}
                            </span>
                            <button type="button" className="text-red-600" onClick={() => removeMember(m.id)}>
                              ×
                            </button>
                          </li>
                        ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Link to shared elective lesson (optional)</label>
            <select
              className="w-full border rounded-lg px-3 py-2"
              value={electiveSessionId}
              onChange={(e) => setElectiveSessionId(e.target.value)}
            >
              <option value="">None — independent joint class</option>
              {electives.map((el) => (
                <option key={el.id} value={el.id}>
                  {el.name} · {el.dayName} P{el.periodNumber}
                </option>
              ))}
            </select>
            <p className="text-[11px] text-slate-400 mt-1">
              Linking does not create a second timetable entry. Electives still control the timetable cell.
            </p>
          </div>

          <div className="grid sm:grid-cols-3 gap-3">
            <div>
              <label className="block font-medium mb-1">Teacher (optional)</label>
              <select className="w-full border rounded-lg px-3 py-2" value={teacherId} onChange={(e) => setTeacherId(e.target.value)}>
                <option value="">Not assigned</option>
                {teachers.map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName} ({t.identifier})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block font-medium mb-1">Teacher code (optional)</label>
              <input className="w-full border rounded-lg px-3 py-2" value={teacherCode} onChange={(e) => setTeacherCode(e.target.value)} placeholder="e.g. T014" />
            </div>
            <div>
              <label className="block font-medium mb-1">Classroom (optional)</label>
              <input className="w-full border rounded-lg px-3 py-2" value={room} onChange={(e) => setRoom(e.target.value)} placeholder="e.g. Computer Lab" />
            </div>
          </div>

          <div>
            <label className="block font-medium mb-1">Notes (optional)</label>
            <textarea className="w-full border rounded-lg px-3 py-2" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </div>

          <button type="submit" disabled={saving} className="inline-flex items-center gap-1 px-4 py-2 bg-slate-900 text-white rounded-lg">
            <Save className="w-4 h-4" /> {editingId ? "Save changes" : "Create joint class"}
          </button>
        </form>
      )}

      {/* Detail panel */}
      {detail && !showForm && (
        <div className="bg-white border rounded-xl p-5 space-y-3 text-sm">
          <div className="flex justify-between">
            <h2 className="font-semibold text-lg">{detail.name}</h2>
            <button type="button" onClick={() => setDetailId(null)}><X className="w-4 h-4" /></button>
          </div>
          <p><span className="text-slate-500">Subject:</span> {areaName(detail.learningAreaId)}</p>
          <p><span className="text-slate-500">Level:</span> {detail.classLevel}</p>
          <p>
            <span className="text-slate-500">Shared elective:</span>{" "}
            {detail.electiveSessionId
              ? electives.find((e) => e.id === detail.electiveSessionId)?.name || detail.electiveSessionId
              : "Not linked"}
          </p>
          <p>
            <span className="text-slate-500">Teacher:</span>{" "}
            {detail.teacherCode || teachers.find((t) => t.id === detail.teacherId)?.fullName || "Not assigned"}
          </p>
          <p><span className="text-slate-500">Room:</span> {detail.room || "Not assigned"}</p>
          <div>
            <p className="font-medium mb-1">Students by stream (total {(detail.members || []).length})</p>
            <table className="w-full text-xs border">
              <thead className="bg-slate-50">
                <tr>
                  <th className="text-left px-2 py-1">Stream</th>
                  <th className="text-left px-2 py-1">Students</th>
                </tr>
              </thead>
              <tbody>
                {(detail.classIds || []).map((sid) => (
                  <tr key={sid} className="border-t">
                    <td className="px-2 py-1">{className(sid)}</td>
                    <td className="px-2 py-1">
                      {(detail.members || []).filter((m) => m.classId === sid).length}
                      <ul className="text-slate-600 mt-0.5">
                        {(detail.members || [])
                          .filter((m) => m.classId === sid)
                          .map((m) => (
                            <li key={m.id}>{m.fullName}{m.admissionNo ? ` (${m.admissionNo})` : ""}</li>
                          ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {canEdit && (
            <div className="flex gap-2">
              <button type="button" className="px-3 py-1.5 border rounded-lg" onClick={() => startEdit(detail)}>
                <Pencil className="w-3 h-3 inline" /> Edit / manage students
              </button>
              <button type="button" className="px-3 py-1.5 text-red-600 border rounded-lg" onClick={() => handleDelete(detail.id)}>
                Delete joint class
              </button>
            </div>
          )}
        </div>
      )}

      {/* Dashboard table */}
      <div className="bg-white border rounded-xl overflow-x-auto">
        <table className="w-full text-sm min-w-[720px]">
          <thead className="bg-slate-50 text-left">
            <tr>
              <th className="px-3 py-2">Joint Class</th>
              <th className="px-3 py-2">Subject</th>
              <th className="px-3 py-2">Level</th>
              <th className="px-3 py-2">Students</th>
              <th className="px-3 py-2">Streams</th>
              <th className="px-3 py-2">Elective link</th>
              {canEdit && <th className="px-3 py-2 w-28" />}
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-3 py-10 text-center text-slate-500">
                  No joint classes yet. Create one to track which students take each elective subject.
                </td>
              </tr>
            ) : (
              filtered.map((j) => (
                <tr key={j.id} className="border-t">
                  <td className="px-3 py-2">
                    <button type="button" className="font-medium text-left hover:underline" onClick={() => setDetailId(j.id)}>
                      {j.name}
                    </button>
                  </td>
                  <td className="px-3 py-2 text-xs">{areaName(j.learningAreaId)}</td>
                  <td className="px-3 py-2">{j.classLevel}</td>
                  <td className="px-3 py-2">{(j.members || []).length}</td>
                  <td className="px-3 py-2">{(j.classIds || []).length}</td>
                  <td className="px-3 py-2 text-xs">
                    {j.electiveSessionId
                      ? electives.find((e) => e.id === j.electiveSessionId)?.name || "Linked"
                      : "—"}
                  </td>
                  {canEdit && (
                    <td className="px-3 py-2">
                      <div className="flex gap-2">
                        <button type="button" onClick={() => startEdit(j)} className="text-slate-700"><Pencil className="w-4 h-4" /></button>
                        <button type="button" onClick={() => handleDelete(j.id)} className="text-red-600"><Trash2 className="w-4 h-4" /></button>
                      </div>
                    </td>
                  )}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
