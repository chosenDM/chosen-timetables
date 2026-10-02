import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  listTeachers,
  createTeacher,
  updateTeacher,
  deactivateTeacher,
  listDepartments,
} from "@/services/schoolService";
import type { Teacher, Department } from "@shared/types";
import { BRAND } from "@/lib/utils";
import { isFullAdmin, isHod, filterByHodDepartment } from "@/lib/roles";
import { Plus, Pencil, Ban } from "lucide-react";

export default function TeachersPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const role = schoolUser?.role;
  const hodDeptId = schoolUser?.departmentId;
  const canEdit = isFullAdmin(role) || isHod(role);
  const [items, setItems] = useState<Teacher[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Teacher | null>(null);
  const [fullName, setFullName] = useState("");
  const [identifier, setIdentifier] = useState("");
  const [staffNumber, setStaffNumber] = useState("");
  const [departmentId, setDepartmentId] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [t, d] = await Promise.all([listTeachers(schoolId), listDepartments(schoolId)]);
      const active = t.filter((x) => x.active !== false);
      setItems(filterByHodDepartment(active, role, hodDeptId));
      const deps = d.filter((x) => x.active !== false);
      setDepartments(
        isHod(role) && hodDeptId ? deps.filter((x) => x.id === hodDeptId) : deps
      );
    } catch {
      toast.error("Failed to load teachers");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId]);

  const openCreate = () => {
    if (!canEdit) return;
    setEditing(null);
    setFullName("");
    setIdentifier("");
    setStaffNumber("");
    setDepartmentId(isHod(role) && hodDeptId ? hodDeptId : "");
    setEmail("");
    setPhone("");
    setShowForm(true);
  };

  const openEdit = (t: Teacher) => {
    setEditing(t);
    setFullName(t.fullName);
    setIdentifier(t.identifier);
    setStaffNumber(t.staffNumber || "");
    setDepartmentId(t.departmentId || "");
    setEmail(t.email || "");
    setPhone(t.phone || "");
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !canEdit || !fullName.trim() || !identifier.trim()) return;
    const dept = isHod(role) && hodDeptId ? hodDeptId : departmentId || undefined;
    setSaving(true);
    try {
      const payload = {
        fullName: fullName.trim(),
        identifier: identifier.trim(),
        staffNumber: staffNumber.trim() || undefined,
        departmentId: dept,
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
      };
      if (editing) {
        await updateTeacher(schoolId, editing.id, payload);
        toast.success("Teacher updated");
      } else {
        await createTeacher(schoolId, payload);
        toast.success("Teacher added");
      }
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDeactivate = async (t: Teacher) => {
    if (!schoolId || !confirm(`Deactivate “${t.fullName}”?`)) return;
    try {
      await deactivateTeacher(schoolId, t.id);
      toast.success("Teacher deactivated");
      await load();
    } catch {
      toast.error("Failed");
    }
  };

  const deptName = (id?: string) => departments.find((d) => d.id === id)?.name || "—";

  if (!schoolId) return <NeedSchool />;

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Teachers</h1>
          <p className="text-sm text-slate-500">Staff members and teacher codes</p>
        </div>
        {canEdit && (
        <button
          onClick={openCreate}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
          style={{ backgroundColor: BRAND.blue }}
        >
          <Plus className="w-4 h-4" /> Add teacher
        </button>
        )}
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold">{editing ? "Edit teacher" : "New teacher"}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <Input label="Full name" value={fullName} onChange={setFullName} required />
            <Input label="Teacher Code (e.g. T01)" value={identifier} onChange={setIdentifier} required />
            <Input label="Staff number" value={staffNumber} onChange={setStaffNumber} />
            <div>
              <label className="block text-sm font-medium mb-1">Department</label>
              <select
                value={departmentId}
                onChange={(e) => setDepartmentId(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">— None —</option>
                {departments.map((d) => (
                  <option key={d.id} value={d.id}>{d.name}</option>
                ))}
              </select>
            </div>
            <Input label="Email" type="email" value={email} onChange={setEmail} />
            <Input label="Phone" value={phone} onChange={setPhone} />
          </div>
          <div className="flex gap-2">
            <button type="submit" disabled={saving} className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60" style={{ backgroundColor: BRAND.blue }}>
              {saving ? "Saving…" : "Save"}
            </button>
            <button type="button" onClick={() => setShowForm(false)} className="px-4 py-2 rounded-lg border text-sm">Cancel</button>
          </div>
        </form>
      )}

      {loading ? (
        <Loading />
      ) : items.length === 0 ? (
        <Empty message="No teachers yet. Add staff so you can allocate subjects." />
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Teacher Code</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Contact</th>
                <th className="px-4 py-3 font-medium w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((t) => (
                <tr key={t.id} className="border-t">
                  <td className="px-4 py-3 font-medium">{t.fullName}</td>
                  <td className="px-4 py-3 text-slate-600">{t.identifier}</td>
                  <td className="px-4 py-3 text-slate-500">{deptName(t.departmentId)}</td>
                  <td className="px-4 py-3 text-slate-500 text-xs">{t.email || t.phone || "—"}</td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(t)} className="p-1.5 rounded hover:bg-slate-100"><Pencil className="w-4 h-4 text-slate-600" /></button>
                      <button onClick={() => handleDeactivate(t)} className="p-1.5 rounded hover:bg-red-50"><Ban className="w-4 h-4 text-red-500" /></button>
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

function Input({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-sm font-medium mb-1">{label}</label>
      <input type={type} value={value} onChange={(e) => onChange(e.target.value)} required={required} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
    </div>
  );
}

function NeedSchool() {
  return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;
}
function Loading() {
  return <div className="flex justify-center py-12"><div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" /></div>;
}
function Empty({ message }: { message: string }) {
  return <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">{message}</div>;
}
