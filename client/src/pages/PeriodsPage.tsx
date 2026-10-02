import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  listPeriods,
  createPeriod,
  updatePeriod,
  deletePeriod,
  getScheduleSettings,
  updateScheduleSettings,
} from "@/services/schoolService";
import type { Period, PeriodKind } from "@shared/types";
import { BRAND } from "@/lib/utils";
import { Plus, Pencil, Trash2 } from "lucide-react";

const KINDS: PeriodKind[] = ["lesson", "assembly", "short_break", "long_break", "lunch", "games", "other"];
const DEFAULT_DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"];

export default function PeriodsPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const [items, setItems] = useState<Period[]>([]);
  const [workingDays, setWorkingDays] = useState<string[]>(DEFAULT_DAYS);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<Period | null>(null);
  const [periodNumber, setPeriodNumber] = useState(1);
  const [label, setLabel] = useState("");
  const [startTime, setStartTime] = useState("08:00");
  const [endTime, setEndTime] = useState("08:40");
  const [kind, setKind] = useState<PeriodKind>("lesson");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!schoolId) return;
    setLoading(true);
    try {
      const [p, settings] = await Promise.all([listPeriods(schoolId), getScheduleSettings(schoolId)]);
      setItems(p.sort((a, b) => a.displayOrder - b.displayOrder));
      if (settings?.workingDays?.length) setWorkingDays(settings.workingDays);
    } catch {
      toast.error("Failed to load periods");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, [schoolId]);

  const openCreate = () => {
    setEditing(null);
    const next = items.length ? Math.max(...items.map((i) => i.periodNumber)) + 1 : 1;
    setPeriodNumber(next);
    setLabel(`Period ${next}`);
    setStartTime("08:00");
    setEndTime("08:40");
    setKind("lesson");
    setShowForm(true);
  };

  const openEdit = (p: Period) => {
    setEditing(p);
    setPeriodNumber(p.periodNumber);
    setLabel(p.label);
    setStartTime(p.startTime);
    setEndTime(p.endTime);
    setKind(p.kind);
    setShowForm(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId) return;
    setSaving(true);
    try {
      const payload = { periodNumber, label: label.trim(), startTime, endTime, kind };
      if (editing) {
        await updatePeriod(schoolId, editing.id, { ...payload, displayOrder: periodNumber });
        toast.success("Period updated");
      } else {
        await createPeriod(schoolId, payload);
        toast.success("Period added");
      }
      setShowForm(false);
      await load();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (p: Period) => {
    if (!schoolId || !confirm(`Delete “${p.label}”?`)) return;
    try {
      await deletePeriod(schoolId, p.id);
      toast.success("Deleted");
      await load();
    } catch {
      toast.error("Failed");
    }
  };

  const toggleDay = async (day: string) => {
    if (!schoolId) return;
    const next = workingDays.includes(day)
      ? workingDays.filter((d) => d !== day)
      : [...workingDays, day];
    // Keep order Mon–Fri
    const ordered = DEFAULT_DAYS.filter((d) => next.includes(d));
    setWorkingDays(ordered);
    try {
      await updateScheduleSettings(schoolId, { workingDays: ordered });
      toast.success("Working days updated");
    } catch {
      toast.error("Failed to update working days");
    }
  };

  if (!schoolId) return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Periods & School Day</h1>
          <p className="text-sm text-slate-500">Configure lesson periods, breaks, assembly and working days</p>
        </div>
        <button onClick={openCreate} className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium" style={{ backgroundColor: BRAND.blue }}>
          <Plus className="w-4 h-4" /> Add period
        </button>
      </div>

      {/* Working days */}
      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold mb-3">Working days</h2>
        <div className="flex flex-wrap gap-2">
          {DEFAULT_DAYS.map((day) => (
            <button
              key={day}
              type="button"
              onClick={() => toggleDay(day)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium border ${
                workingDays.includes(day)
                  ? "bg-brand-blue text-white border-brand-blue"
                  : "bg-white text-slate-600 border-slate-300"
              }`}
            >
              {day.slice(0, 3)}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400 mt-2">Timezone defaults to Africa/Nairobi</p>
      </div>

      {showForm && (
        <form onSubmit={handleSave} className="bg-white rounded-xl border p-5 space-y-4">
          <h2 className="font-semibold">{editing ? "Edit period" : "New period"}</h2>
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Period number</label>
              <input type="number" min={1} value={periodNumber} onChange={(e) => setPeriodNumber(Number(e.target.value))} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Label</label>
              <input value={label} onChange={(e) => setLabel(e.target.value)} required className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Start time</label>
              <input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">End time</label>
              <input type="time" value={endTime} onChange={(e) => setEndTime(e.target.value)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
            </div>
            <div className="sm:col-span-2">
              <label className="block text-sm font-medium mb-1">Type</label>
              <select value={kind} onChange={(e) => setKind(e.target.value as PeriodKind)} className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm">
                {KINDS.map((k) => (
                  <option key={k} value={k}>{k.replace("_", " ")}</option>
                ))}
              </select>
              <p className="text-xs text-slate-400 mt-1">Only “lesson” periods receive timetable lessons.</p>
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
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">No periods configured. Add lesson periods and breaks.</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[560px]">
            <thead className="bg-slate-50 text-left">
              <tr>
                <th className="px-4 py-3 font-medium">#</th>
                <th className="px-4 py-3 font-medium">Label</th>
                <th className="px-4 py-3 font-medium">Time</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium w-28">Actions</th>
              </tr>
            </thead>
            <tbody>
              {items.map((p) => (
                <tr key={p.id} className="border-t">
                  <td className="px-4 py-3">{p.periodNumber}</td>
                  <td className="px-4 py-3 font-medium">{p.label}</td>
                  <td className="px-4 py-3 text-slate-600">{p.startTime} – {p.endTime}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs font-medium ${p.kind === "lesson" ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-600"}`}>
                      {p.kind.replace("_", " ")}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex gap-2">
                      <button onClick={() => openEdit(p)} className="p-1.5 rounded hover:bg-slate-100"><Pencil className="w-4 h-4 text-slate-600" /></button>
                      <button onClick={() => handleDelete(p)} className="p-1.5 rounded hover:bg-red-50"><Trash2 className="w-4 h-4 text-red-500" /></button>
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
