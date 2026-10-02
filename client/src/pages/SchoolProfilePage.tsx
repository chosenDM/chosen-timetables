import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  createSchool,
  getSchool,
  updateSchool,
  uploadSchoolLogo,
} from "@/services/schoolService";
import type { School } from "@shared/types";
import { BRAND } from "@/lib/utils";

export default function SchoolProfilePage() {
  const { user, schoolUser, refreshSchoolUser } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // Form state
  const [name, setName] = useState("");
  const [schoolType, setSchoolType] = useState("Secondary");
  const [academicYear, setAcademicYear] = useState("2026");
  const [term, setTerm] = useState("Term 1");
  const [county, setCounty] = useState("");
  const [contactEmail, setContactEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [logoFile, setLogoFile] = useState<File | null>(null);

  useEffect(() => {
    async function load() {
      if (!schoolUser?.schoolId) {
        setLoading(false);
        return;
      }
      try {
        const s = await getSchool(schoolUser.schoolId);
        if (s) {
          setSchool(s);
          setName(s.name);
          setSchoolType(s.schoolType);
          setAcademicYear(s.academicYear);
          setTerm(s.term);
          setCounty(s.county);
          setContactEmail(s.contactEmail);
          setPhone(s.phone);
        }
      } catch (e) {
        toast.error("Failed to load school");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [schoolUser?.schoolId]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!name.trim() || !county.trim() || !contactEmail.trim()) {
      toast.error("Name, county and contact email are required");
      return;
    }
    setSaving(true);
    try {
      await createSchool(user.uid, {
        name,
        schoolType,
        academicYear,
        term,
        county,
        contactEmail,
        phone,
      });
      await refreshSchoolUser();
      toast.success("School created. You are the Principal.");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to create school");
    } finally {
      setSaving(false);
    }
  };

  const handleUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!school) return;
    setSaving(true);
    try {
      await updateSchool(school.id, {
        name: name.trim(),
        schoolType,
        academicYear,
        term,
        county: county.trim(),
        contactEmail: contactEmail.trim(),
        phone: phone.trim(),
      });
      if (logoFile) {
        await uploadSchoolLogo(school.id, logoFile);
      }
      const updated = await getSchool(school.id);
      setSchool(updated);
      toast.success("School profile updated");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Update failed");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // No school yet → create form
  if (!schoolUser?.schoolId) {
    return (
      <div className="max-w-xl mx-auto">
        <h1 className="text-2xl font-bold text-slate-900 mb-2">Create your school</h1>
        <p className="text-slate-600 mb-6 text-sm">
          Set up your school to start managing departments, teachers and timetables.
        </p>
        <form onSubmit={handleCreate} className="bg-white rounded-xl border p-6 space-y-4">
          <Field label="School name" value={name} onChange={setName} required />
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">School type</label>
            <select
              value={schoolType}
              onChange={(e) => setSchoolType(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
            >
              <option>Primary</option>
              <option>Secondary</option>
              <option>Junior Secondary</option>
              <option>Mixed</option>
              <option>Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Field label="Academic year" value={academicYear} onChange={setAcademicYear} required />
            <Field label="Term" value={term} onChange={setTerm} required />
          </div>
          <Field label="County" value={county} onChange={setCounty} required />
          <Field label="Contact email" type="email" value={contactEmail} onChange={setContactEmail} required />
          <Field label="Phone" value={phone} onChange={setPhone} />
          <button
            type="submit"
            disabled={saving}
            className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-60"
            style={{ backgroundColor: BRAND.blue }}
          >
            {saving ? "Creating…" : "Create school"}
          </button>
        </form>
      </div>
    );
  }

  // Existing school → edit form
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">School Profile</h1>
        <p className="text-sm text-slate-500 mt-1">
          Plan: <span className="font-medium capitalize">{school?.plan}</span> · Status:{" "}
          <span className="font-medium capitalize">{school?.accountStatus}</span>
        </p>
      </div>

      <form onSubmit={handleUpdate} className="bg-white rounded-xl border p-6 space-y-4">
        {school?.logoUrl && (
          <div className="flex justify-center mb-2">
            <img src={school.logoUrl} alt="Logo" className="h-16 object-contain" />
          </div>
        )}
        <Field label="School name" value={name} onChange={setName} required />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">School type</label>
          <select
            value={schoolType}
            onChange={(e) => setSchoolType(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option>Primary</option>
            <option>Secondary</option>
            <option>Junior Secondary</option>
            <option>Mixed</option>
            <option>Other</option>
          </select>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Academic year" value={academicYear} onChange={setAcademicYear} required />
          <Field label="Term" value={term} onChange={setTerm} required />
        </div>
        <Field label="County" value={county} onChange={setCounty} required />
        <Field label="Contact email" type="email" value={contactEmail} onChange={setContactEmail} required />
        <Field label="Phone" value={phone} onChange={setPhone} />
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Logo</label>
          <input
            type="file"
            accept="image/png,image/jpeg,image/webp"
            onChange={(e) => setLogoFile(e.target.files?.[0] ?? null)}
            className="w-full text-sm"
          />
          <p className="text-xs text-slate-400 mt-1">PNG, JPEG or WebP. Stored in Firebase Storage.</p>
        </div>
        <button
          type="submit"
          disabled={saving}
          className="w-full py-2.5 rounded-lg text-white font-medium disabled:opacity-60"
          style={{ backgroundColor: BRAND.blue }}
        >
          {saving ? "Saving…" : "Save changes"}
        </button>
      </form>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = "text",
  required,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  type?: string;
  required?: boolean;
}) {
  return (
    <div>
      <label className="block text-sm font-medium text-slate-700 mb-1">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand-blue/40 focus:border-brand-blue"
      />
    </div>
  );
}
