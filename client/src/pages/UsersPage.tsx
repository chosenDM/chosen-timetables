/**
 * School users & roles management.
 * Principal / timetable_admin can invite-style add and change roles.
 * Note: Creating Auth users requires Admin SDK or client createUser;
 * here we manage membership docs; full invite email can use Cloud Function later.
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  updateDoc,
  serverTimestamp,
} from "firebase/firestore";
import { db, auth, createAuthUserWithoutSessionSwitch } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { listDepartments } from "@/services/schoolService";
import type { SchoolUser, UserRole, Department } from "@shared/types";
import { BRAND } from "@/lib/utils";
import { Plus, Pencil, Ban, Check } from "lucide-react";

const ROLES: { value: UserRole; label: string }[] = [
  { value: "principal", label: "Principal / Head" },
  { value: "timetable_admin", label: "Timetable administrator" },
  { value: "hod", label: "HOD" },
  { value: "teacher", label: "Teacher" },
  { value: "viewer", label: "Viewer" },
];

export default function UsersPage() {
  const { user, schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const canManage =
    schoolUser?.role === "principal" || schoolUser?.role === "timetable_admin";

  const [users, setUsers] = useState<SchoolUser[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<SchoolUser | null>(null);
  const [saving, setSaving] = useState(false);

  const [email, setEmail] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<UserRole>("teacher");
  const [departmentId, setDepartmentId] = useState("");

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [snap, deps] = await Promise.all([
        getDocs(collection(db, "schools", schoolId, "users")),
        listDepartments(schoolId),
      ]);
      setUsers(
        snap.docs.map((d) => ({ id: d.id, ...d.data() } as SchoolUser))
      );
      setDepartments(deps.filter((d) => d.active !== false));
    } catch {
      toast.error("Failed to load users");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [schoolId]);

  const openCreate = () => {
    setEditing(null);
    setEmail("");
    setDisplayName("");
    setPassword("");
    setRole("teacher");
    setDepartmentId("");
    setShowForm(true);
  };

  const openEdit = (u: SchoolUser) => {
    setEditing(u);
    setEmail(u.email);
    setDisplayName(u.displayName);
    setPassword("");
    setRole(u.role);
    setDepartmentId(u.departmentId || "");
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !canManage) return;

    if (editing) {
      setSaving(true);
      try {
        await updateDoc(doc(db, "schools", schoolId, "users", editing.id), {
          displayName: displayName.trim(),
          role,
          departmentId: role === "hod" ? departmentId || null : null,
          updatedAt: new Date().toISOString(),
        });
        // Keep userProfiles in sync if this is the same user
        await setDoc(
          doc(db, "userProfiles", editing.id),
          {
            displayName: displayName.trim(),
            role,
            schoolId,
            updatedAt: serverTimestamp(),
          },
          { merge: true }
        );
        toast.success("User updated");
        setShowForm(false);
        await load();
      } catch (err: unknown) {
        toast.error(err instanceof Error ? err.message : "Update failed");
      } finally {
        setSaving(false);
      }
      return;
    }

    // Create: needs email + password to create Auth account
    if (!email.trim() || !password || password.length < 8 || !displayName.trim()) {
      toast.error("Name, email and password (min 8) are required");
      return;
    }

    setSaving(true);
    try {
      // Create Auth user on a secondary app so the principal session stays intact
      const newUid = await createAuthUserWithoutSessionSwitch(
        email.trim(),
        password
      );

      await setDoc(doc(db, "schools", schoolId, "users", newUid), {
        schoolId,
        email: email.trim(),
        displayName: displayName.trim(),
        role,
        departmentId: role === "hod" ? departmentId || null : null,
        active: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      await setDoc(doc(db, "userProfiles", newUid), {
        email: email.trim(),
        displayName: displayName.trim(),
        schoolId,
        role,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      toast.success("User created successfully");
      setShowForm(false);
      setEmail("");
      setDisplayName("");
      setPassword("");
      setRole("teacher");
      setDepartmentId("");
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Create failed");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (u: SchoolUser) => {
    if (!schoolId || !canManage) return;
    if (u.id === user?.uid) {
      toast.error("You cannot deactivate yourself");
      return;
    }
    try {
      await updateDoc(doc(db, "schools", schoolId, "users", u.id), {
        active: !u.active,
        updatedAt: new Date().toISOString(),
      });
      toast.success(u.active ? "User deactivated" : "User activated");
      await load();
    } catch {
      toast.error("Failed");
    }
  };

  const deptName = (id?: string) =>
    departments.find((d) => d.id === id)?.name || "—";

  if (!schoolId) {
    return (
      <div className="text-center py-16 text-slate-600">
        Create or join a school first.
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Users</h1>
          <p className="text-sm text-slate-500">
            School membership and roles · HOD can be limited to a department
          </p>
        </div>
        {canManage && (
          <button
            onClick={openCreate}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: BRAND.blue }}
          >
            <Plus className="w-4 h-4" /> Add user
          </button>
        )}
      </div>

      {!canManage && (
        <p className="text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-4 py-2">
          Only the Principal or Timetable Administrator can manage users.
        </p>
      )}

      {showForm && canManage && (
        <form
          onSubmit={handleSave}
          className="bg-white rounded-xl border p-5 space-y-4"
        >
          <h2 className="font-semibold">
            {editing ? "Edit user" : "New user"}
          </h2>
          {!editing && (
            <p className="text-xs text-slate-500">
              Creates a Firebase Auth account. For production invites without
              switching session, use a Cloud Function with Admin SDK.
            </p>
          )}
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Display name</label>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Email</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={!!editing}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm disabled:bg-slate-50"
              />
            </div>
            {!editing && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Temporary password
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={8}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            )}
            <div>
              <label className="block text-sm font-medium mb-1">Role</label>
              <select
                value={role}
                onChange={(e) => setRole(e.target.value as UserRole)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>
            {role === "hod" && (
              <div>
                <label className="block text-sm font-medium mb-1">
                  Department
                </label>
                <select
                  value={departmentId}
                  onChange={(e) => setDepartmentId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                >
                  <option value="">— Select —</option>
                  {departments.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
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
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
        </div>
      ) : users.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
          No users yet.
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">Name</th>
                <th className="px-4 py-3 font-medium">Email</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Department</th>
                <th className="px-4 py-3 font-medium">Status</th>
                {canManage && (
                  <th className="px-4 py-3 font-medium w-28">Actions</th>
                )}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-t">
                  <td className="px-4 py-3 font-medium">
                    {u.displayName}
                    {u.id === user?.uid && (
                      <span className="ml-1 text-xs text-brand-blue">(you)</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{u.email}</td>
                  <td className="px-4 py-3 capitalize">
                    {u.role.replace("_", " ")}
                  </td>
                  <td className="px-4 py-3 text-slate-500">
                    {u.role === "hod" ? deptName(u.departmentId) : "—"}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${
                        u.active !== false
                          ? "bg-green-50 text-green-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {u.active !== false ? "Active" : "Inactive"}
                    </span>
                  </td>
                  {canManage && (
                    <td className="px-4 py-3">
                      <div className="flex gap-1">
                        <button
                          onClick={() => openEdit(u)}
                          className="p-1.5 rounded hover:bg-slate-100"
                          title="Edit"
                        >
                          <Pencil className="w-4 h-4 text-slate-600" />
                        </button>
                        {u.id !== user?.uid && (
                          <button
                            onClick={() => toggleActive(u)}
                            className="p-1.5 rounded hover:bg-slate-100"
                            title={u.active !== false ? "Deactivate" : "Activate"}
                          >
                            {u.active !== false ? (
                              <Ban className="w-4 h-4 text-red-500" />
                            ) : (
                              <Check className="w-4 h-4 text-green-600" />
                            )}
                          </button>
                        )}
                      </div>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
