import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  listDepartments,
  createDepartment,
  updateDepartment,
  deactivateDepartment,
} from "@/services/schoolService";
import type { Department } from "@shared/types";
import { BRAND } from "@/lib/utils";
import { Plus, Pencil, Ban } from "lucide-react";

export default function DepartmentsPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const [items, setItems] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Department | null>(null);
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const data = await listDepartments(schoolId);
      setItems(data.filter((d) => d.active !== false));
    } catch {
      toast.error("Failed to load departments");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId]);

  const openCreate = () => {
    setEditing(null);
    setName("");
    setCode("");
    setShowForm(true);
  };

  const openEdit = (d: Department) => {
    setEditing(d);
    setName(d.name);
    setCode(d.code || "");
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !name.trim()) return;
    setSaving(true);
    try {
      if (editing) {
        await updateDepartment(schoolId, editing.id, { name: name.trim(), code: code.trim() || undefined });
        toast.success("Department updated");
      } else {
        await createDepartment(schoolId, { name: name.trim(), code: code.trim() || undefined });
        toast.success("Department created");
      }
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (d: Department) => {
    if (!schoolId || !confirm(`Deactivate “${d.name}”?`)) return;
    try {
      await deactivateDepartment(schoolId, d.id);
      toast.success("Department deactivated");
      await load();
    } catch {
      toast.error("Failed to deactivate");
    }
  };

  if (!schoolId) {
    return <NeedSchool />;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Departments</h1>
          <p className="text-sm text-slate-500">Organise learning areas by department</p>
        </div>
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: BRAND.blue }}
        >
          <Plus className="w-4 h-4" /> Add
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold">{editing ? "Edit department" : "New department"}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. Mathematics"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Code (optional)</label>
              <input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="e.g. MATH"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: BRAND.blue }}
            >
              {saving ? "Saving…" : "Save"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 rounded-lg border text-sm"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty message="No departments yet. Add Languages, Mathematics, Sciences, etc." />
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Code</th>
                <th className="px-4 py-3 font-medium w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((d) => (
                <tr key={d.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{d.name}</td>
                  <td className="px-4 py-3 text-slate-500">{d.code || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(d)} className="p-1.5 rounded hover:bg-slate-100" title="Edit">
                        <Pencil className="w-4 h-4 text-slate-600" />
                      </button>
                      <button onClick={() => handleDeactivate(d)} className="p-1.5 rounded hover:bg-red-50" title="Deactivate">
                        <Ban className="w-4 h-4 text-red-500" />
                      </button>
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

function NeedSchool() {
  return (
    <div className="text-center py-16 text-slate-600">
      Create or join a school first (School Profile).
    </div>
  );
}

function Loading() {
  return (
    <div className="flex justify-center py-12">
      <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

function Empty({ message }: { message: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
      {message}
    </div>
  );
}
