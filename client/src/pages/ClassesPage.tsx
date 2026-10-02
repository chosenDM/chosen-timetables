import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { listClasses, createClass, updateClass, deactivateClass } from "@/services/schoolService";
import type { SchoolClass } from "@shared/types";
import { BRAND } from "@/lib/utils";
import { isFullAdmin, isHod } from "@/lib/roles";
import { Plus, Pencil, Ban } from "lucide-react";

export default function ClassesPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const canEdit = isFullAdmin(schoolUser?.role) || isHod(schoolUser?.role);
  const [items, setItems] = useState<SchoolClass[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SchoolClass | null>(null);
  const [name, setName] = useState("");
  const [grade, setGrade] = useState("");
  const [stream, setStream] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const data = await listClasses(schoolId);
      setItems(data.filter((c) => c.active !== false));
    } catch {
      toast.error("Failed to load classes");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [schoolId]);

  const openCreate = () => {
    if (!canEdit) return;
    setEditing(null);
    setName("");
    setGrade("");
    setStream("");
    setShowForm(true);
  };

  const openEdit = (c: SchoolClass) => {
    setEditing(c);
    setName(c.name);
    setGrade(c.grade || "");
    setStream(c.stream || "");
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !canEdit || !name.trim()) return;
    setSaving(true);
    try {
      const payload = { name: name.trim(), grade: grade.trim() || undefined, stream: stream.trim() || undefined };
      if (editing) {
        await updateClass(schoolId, editing.id, payload);
        toast.success("Class updated");
      } else {
        await createClass(schoolId, payload);
        toast.success("Class created");
      }
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (c: SchoolClass) => {
    if (!schoolId || !confirm(`Deactivate “${c.name}”?`)) return;
    try {
      await deactivateClass(schoolId, c.id);
      toast.success("Class deactivated");
      await load();
    } catch {
      toast.error("Failed");
    }
  };

  if (!schoolId) return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Classes</h1>
          <p className="text-sm text-slate-500">Forms and streams (e.g. Form 1 East)</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: BRAND.blue }}>
          <Plus className="w-4 h-4" /> Add class
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold">{editing ? "Edit class" : "New class"}</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input value={name} onChange={(e) => setName(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Form 1 East" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Grade / Form</label>
              <input value={grade} onChange={(e) => setGrade(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="Form 1" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Stream</label>
              <input value={stream} onChange={(e) => setStream(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" placeholder="East" />
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
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">No classes yet. Add Form 1 East, Form 2 West, etc.</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Grade</th>
                <th className="px-4 py-3 font-medium">Stream</th>
                <th className="px-4 py-3 font-medium w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-slate-500">{c.grade || "—"}</td>
                  <td className="px-4 py-3 text-slate-500">{c.stream || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(c)} className="p-1.5 rounded hover:bg-slate-100"><Pencil className="w-4 h-4 text-slate-600" /></button>
                      <button onClick={() => handleDeactivate(c)} className="p-1.5 rounded hover:bg-red-50"><Ban className="w-4 h-4 text-red-500" /></button>
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
