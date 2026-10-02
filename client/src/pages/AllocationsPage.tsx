/**
 * Subject Allocation + HOD workflow
 * Status: draft → submitted → under_review → approved | rejected
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  listAllocations,
  createAllocation,
  updateAllocation,
  listTeachers,
  listClasses,
  listLearningAreas,
} from "@/services/schoolService";
import type {
  Allocation,
  AllocationStatus,
  Teacher,
  SchoolClass,
  LearningArea,
  UserRole,
} from "@shared/types";
import { BRAND } from "@/lib/utils";
import { isHod, filterByHodDepartment } from "@/lib/roles";
import { Plus, Check, X, Send, Eye } from "lucide-react";

const STATUS_STYLE: Record<AllocationStatus, string> = {
  draft: "bg-slate-100 text-slate-700",
  submitted: "bg-amber-50 text-amber-800",
  under_review: "bg-blue-50 text-blue-800",
  approved: "bg-green-50 text-green-800",
  rejected: "bg-red-50 text-red-800",
};

function canManage(role?: UserRole) {
  return role === "principal" || role === "timetable_admin";
}
function canCreate(role?: UserRole) {
  return canManage(role) || role === "hod";
}

export default function AllocationsPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const role = schoolUser?.role;

  const [items, setItems] = useState<Allocation[]>([]);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [areas, setAreas] = useState<LearningArea[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [teacherId, setTeacherId] = useState("");
  const [classId, setClassId] = useState("");
  const [extraClassIds, setExtraClassIds] = useState<string[]>([]);
  const [room, setRoom] = useState("");
  const [parallelGroupId, setParallelGroupId] = useState("");
  const [learningAreaId, setLearningAreaId] = useState("");
  const [lessonsPerWeek, setLessonsPerWeek] = useState(4);
  const [doubleLessons, setDoubleLessons] = useState(0);
  const [saving, setSaving] = useState(false);
  const [rejectId, setRejectId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState("");

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [a, t, c, la] = await Promise.all([
        listAllocations(schoolId),
        listTeachers(schoolId),
        listClasses(schoolId),
        listLearningAreas(schoolId),
      ]);
      setItems(a);
      // Keep FULL lists for name display; HOD filter only applies to form dropdowns
      setTeachers(t.filter((x) => x.active !== false));
      setClasses(c.filter((x) => x.active !== false));
      setAreas(la.filter((x) => x.active !== false));
    } catch (err: unknown) {
      console.error(err);
      toast.error(err instanceof Error ? err.message : "Failed to load allocations");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId]);

  const teacherOptions = filterByHodDepartment(
    teachers,
    role,
    schoolUser?.departmentId
  );
  const areaOptions = filterByHodDepartment(
    areas,
    role,
    schoolUser?.departmentId
  );

  const teacherName = (id: string) => {
    const t = teachers.find((x) => x.id === id);
    return t ? `${t.fullName} (${t.identifier})` : id;
  };
  const className = (id: string) => classes.find((x) => x.id === id)?.name || id;
  const areaName = (id: string) => {
    const a = areas.find((x) => x.id === id);
    return a ? `${a.name} (${a.code})` : id;
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !teacherId || !classId || !learningAreaId) {
      toast.error("Teacher, class and learning area are required");
      return;
    }
    setSaving(true);
    try {
      // HOD starts as submitted; admin can start as approved
      const status: AllocationStatus = role === "hod" ? "submitted" : "draft";
      await createAllocation(schoolId, {
        teacherId,
        classId,
        extraClassIds: extraClassIds.filter((id) => id !== classId),
        learningAreaId,
        lessonsPerWeek,
        doubleLessons,
        room: room.trim() || undefined,
        parallelGroupId: parallelGroupId.trim() || undefined,
        status,
      });
      toast.success("Allocation created");
      setShowForm(false);
      setTeacherId("");
      setClassId("");
      setLearningAreaId("");
      setLessonsPerWeek(4);
      setDoubleLessons(0);
      setRoom("");
      setParallelGroupId("");
      setExtraClassIds([]);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  const setStatus = async (id: string, status: AllocationStatus, rejectionReason?: string) => {
    if (!schoolId) return;
    try {
      await updateAllocation(schoolId, id, {
        status,
        ...(rejectionReason ? { rejectionReason } : {}),
        ...(status === "approved" || status === "rejected" ? { reviewedBy: schoolUser?.id } : {}),
      });
      toast.success(`Marked as ${status.replace("_", " ")}`);
      setRejectId(null);
      setRejectReason("");
      await load();
    } catch {
      toast.error("Update failed");
    }
  };

  if (!schoolId) {
    return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Subject Allocations</h1>
          <p className="text-sm text-slate-500">
            HOD submits → Timetable Admin reviews → Approve or Reject. Only approved allocations are used for generation.
          </p>
        </div>
        {canCreate(role) && (
          <button
            onClick={() => setShowForm(true)}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: BRAND.blue }}
          >
            <Plus className="w-4 h-4" /> New allocation
          </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleCreate} className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold">New allocation</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Teacher</label>
              <select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select…</option>
                {teacherOptions.map((t) => (
                  <option key={t.id} value={t.id}>{t.fullName} ({t.identifier})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select…</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 mb-1">Joint with other classes (optional)</label>
              <div className="flex flex-wrap gap-2 max-h-24 overflow-y-auto border rounded-lg p-2">
                {classes.filter((c) => c.id !== classId).map((c) => (
                  <label key={c.id} className="inline-flex items-center gap-1 text-xs">
                    <input
                      type="checkbox"
                      checked={extraClassIds.includes(c.id)}
                      onChange={(e) => {
                        setExtraClassIds((prev) =>
                          e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id)
                        );
                      }}
                    />
                    {c.name}
                  </label>
                ))}
              </div>
              <p className="text-[11px] text-slate-400 mt-1">
                Joint streams: same subject + teacher at the same time (e.g. F4E + F4W Chemistry).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Parallel elective block (optional)</label>
              <input
                type="text"
                value={parallelGroupId}
                onChange={(e) => setParallelGroupId(e.target.value)}
                placeholder="e.g. F4 Science Options"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
              <p className="text-[11px] text-slate-400 mt-1">
                Same name on Chem + Bio (+ …) allocations → scheduled together (split class / selectives).
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Room / Lab (optional)</label>
              <input
                type="text"
                value={room}
                onChange={(e) => setRoom(e.target.value)}
                placeholder="e.g. Chem Lab, Comp Lab"
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Learning area</label>
              <select value={learningAreaId} onChange={(e) => setLearningAreaId(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">Select…</option>
                {areaOptions.map((a) => (
                  <option key={a.id} value={a.id}>{a.name} ({a.code})</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Lessons / week</label>
                <input type="number" min={1} max={20} value={lessonsPerWeek} onChange={(e) => setLessonsPerWeek(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Double lessons</label>
                <input type="number" min={0} max={5} value={doubleLessons} onChange={(e) => setDoubleLessons(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60" style={{ backgroundColor: BRAND.blue }}>
              {saving ? "Saving…" : "Create"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
          </div>
        </form>
      )}

      {/* Reject reason modal */}
      {rejectId && (
        <div className="bg-white rounded-xl border border-red-200 p-5 space-y-3">
          <h3 className="font-semibold text-red-800">Rejection reason</h3>
          <textarea
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            rows={3}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            placeholder="Explain what needs to change…"
          />
          <div className="flex gap-2">
            <button
              onClick={() => setStatus(rejectId, "rejected", rejectReason || "No reason provided")}
              className="px-4 py-2 rounded-lg bg-red-600 text-white text-sm font-medium"
            >
              Confirm reject
            </button>
            <button onClick={() => { setRejectId(null); setRejectReason(""); }} className="px-4 py-2 rounded-lg border text-sm">
              Cancel
            </button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
        </div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
          No allocations yet. HOD or admin can create them.
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[720px]">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Teacher</th>
                <th className="px-4 py-3 font-medium">Class</th>
                <th className="px-4 py-3 font-medium">Subject</th>
                <th className="px-4 py-3 font-medium">Lessons</th>
                <th className="px-4 py-3 font-medium">Doubles</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3">{teacherName(a.teacherId)}</td>
                  <td className="px-4 py-3">{className(a.classId)}</td>
                  <td className="px-4 py-3">{areaName(a.learningAreaId)}</td>
                  <td className="px-4 py-3">{a.lessonsPerWeek}</td>
                  <td className="px-4 py-3">{a.doubleLessons}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${STATUS_STYLE[a.status]}`}>
                      {a.status.replace("_", " ")}
                    </span>
                    {a.status === "rejected" && a.rejectionReason && (
                      <p className="text-xs text-red-600 mt-1 max-w-[160px]">{a.rejectionReason}</p>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {/* HOD: submit draft */}
                      {role === "hod" && a.status === "draft" && (
                        <ActionBtn icon={Send} label="Submit" onClick={() => setStatus(a.id, "submitted")} />
                      )}
                      {/* Admin: move to review / approve / reject */}
                      {canManage(role) && (a.status === "submitted" || a.status === "draft") && (
                        <ActionBtn icon={Eye} label="Review" onClick={() => setStatus(a.id, "under_review")} />
                      )}
                      {canManage(role) && (a.status === "under_review" || a.status === "submitted") && (
                        <>
                          <ActionBtn icon={Check} label="Approve" onClick={() => setStatus(a.id, "approved")} color="green" />
                          <ActionBtn icon={X} label="Reject" onClick={() => setRejectId(a.id)} color="red" />
                        </>
                      )}
                      {/* Allow re-submit after reject */}
                      {(role === "hod" || canManage(role)) && a.status === "rejected" && (
                        <ActionBtn icon={Send} label="Resubmit" onClick={() => setStatus(a.id, "submitted")} />
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ActionBtn({
  icon: Icon,
  label,
  onClick,
  color,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  color?: "green" | "red";
}) {
  const cls =
    color === "green"
      ? "text-green-700 hover:bg-green-50"
      : color === "red"
        ? "text-red-700 hover:bg-red-50"
        : "text-slate-700 hover:bg-slate-100";
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      className={`inline-flex items-center gap-1 px-2 py-1 rounded text-xs font-medium ${cls}`}
    >
      <Icon className="w-3.5 h-3.5" />
      {label}
    </button>
  );
}
