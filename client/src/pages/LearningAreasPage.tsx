import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  listLearningAreas,
  createLearningArea,
  updateLearningArea,
  deactivateLearningArea,
  listDepartments,
} from "@/services/schoolService";
import type { LearningArea, Department } from "@shared/types";
import { BRAND } from "@/lib/utils";
import { isFullAdmin, isHod, filterByHodDepartment } from "@/lib/roles";
import { Plus, Pencil, Ban } from "lucide-react";

export default function LearningAreasPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const role = schoolUser?.role;
  const hodDeptId = schoolUser?.departmentId;
  const canEdit = isFullAdmin(role) || isHod(role);
  const [items, setItems] = useState<LearningArea[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<LearningArea | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [description, setDescription] = useState("");
  const [requiredLessons, setRequiredLessons] = useState(4);
  const [doubleLessons, setDoubleLessons] = useState(0);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [la, d] = await Promise.all([listLearningAreas(schoolId), listDepartments(schoolId)]);
      const active = la.filter((x) => x.active !== false);
      setItems(filterByHodDepartment(active, role, hodDeptId));
      const deps = d.filter((x) => x.active !== false);
      setDepartments(
        isHod(role) && hodDeptId ? deps.filter((x) => x.id === hodDeptId) : deps
      );
    } catch {
      toast.error("Failed to load learning areas");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [schoolId]);

  const openCreate = () => {
    if (!canEdit) return;
    setEditing(null);
    setName("");
    setCode("");
    setDepartmentId(isHod(role) && hodDeptId ? hodDeptId : "");
    setDescription("");
    setRequiredLessons(4);
    setDoubleLessons(0);
    setShowForm(true);
  };

  const openEdit = (a: LearningArea) => {
    setEditing(a);
    setName(a.name);
    setCode(a.code);
    setDepartmentId(a.departmentId || "");
    setDescription(a.description || "");
    setRequiredLessons(a.requiredLessonsPerWeek);
    setDoubleLessons(a.doubleLessons);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !canEdit || !name.trim() || !code.trim()) return;
    const dept = isHod(role) && hodDeptId ? hodDeptId : departmentId || undefined;
    setSaving(true);
    try {
      const payload = {
        name: name.trim(),
        code: code.trim().toUpperCase(),
        departmentId: dept,
        description: description.trim() || undefined,
        requiredLessonsPerWeek: requiredLessons,
        doubleLessons,
      };
      if (editing) {
        await updateLearningArea(schoolId, editing.id, payload);
        toast.success("Learning area updated");
      } else {
        await createLearningArea(schoolId, payload);
        toast.success("Learning area created");
      }
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (a: LearningArea) => {
    if (!schoolId || !confirm(`Deactivate “${a.name}”?`)) return;
    try {
      await deactivateLearningArea(schoolId, a.id);
      toast.success("Deactivated");
      await load();
    } catch {
      toast.error("Failed");
    }
  };

  const deptName = (id?: string) => departments.find((d) => d.id === id)?.name || "—";

  if (!schoolId) return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Learning Areas</h1>
          <p className="text-sm text-slate-500">Subjects / learning areas with weekly lesson requirements</p>
        </div>
        {canEdit && (
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: BRAND.blue }}>
          <Plus className="w-4 h-4" /> Add
        </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold">{editing ? "Edit learning area" : "New learning area"}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Mathematics" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Code</label>
              <input value={code} onChange={(e) => setCode(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="MATH" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Department</label>
              <select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                <option value="">— None —</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Description</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Lessons per week</label>
              <input type="number" min={1} max={20} value={requiredLessons} onChange={(e) => setRequiredLessons(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Double lessons</label>
              <input type="number" min={0} max={5} value={doubleLessons} onChange={(e) => setDoubleLessons(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60" style={{ backgroundColor: BRAND.blue }}>{saving ? "Saving…" : "Save"}</button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" /></div>
      ) : items.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">No learning areas yet. Add Mathematics, English, Kiswahili, etc.</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium">Dept</th>
                <th className="px-4 py-3 font-medium">Lessons/wk</th>
                <th className="px-4 py-3 font-medium">Doubles</th>
                <th className="px-4 py-3 font-medium w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{a.name}</td>
                  <td className="px-4 py-3 text-slate-600">{a.code}</td>
                  <td className="px-4 py-3 text-slate-500">{deptName(a.departmentId)}</td>
                  <td className="px-4 py-3">{a.requiredLessonsPerWeek}</td>
                  <td className="px-4 py-3">{a.doubleLessons}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(a)} className="p-1.5 rounded hover:bg-slate-100"><Pencil className="w-4 h-4 text-slate-600" /></button>
                      <button onClick={() => handleDeactivate(a)} className="p-1.5 rounded hover:bg-red-50"><Ban className="w-4 h-4 text-red-500" /></button>
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
