/**
 * School schedule / workspace settings
 */

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  getScheduleSettings,
  updateScheduleSettings,
} from "@/services/schoolService";
import { BRAND } from "@/lib/utils";
import { Save } from "lucide-react";

const ALL_DAYS = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export default function SettingsPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const canEdit =
    schoolUser?.role === "principal" || schoolUser?.role === "timetable_admin";

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [workingDays, setWorkingDays] = useState<string[]>([
    "Monday",
    "Tuesday",
    "Wednesday",
    "Thursday",
    "Friday",
  ]);
  const [weekStart, setWeekStart] = useState("Monday");
  const [timezone, setTimezone] = useState("Africa/Nairobi");

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      setLoading(true);
      try {
        const s = await getScheduleSettings(schoolId);
        if (s) {
          if (s.workingDays?.length) setWorkingDays(s.workingDays);
          if (s.weekStart) setWeekStart(s.weekStart);
          if (s.timezone) setTimezone(s.timezone);
        }
      } catch {
        toast.error("Failed to load settings");
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId]);

  const toggleDay = (day: string) => {
    setWorkingDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]
    );
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolId || !canEdit) return;
    if (workingDays.length === 0) {
      toast.error("Select at least one working day");
      return;
    }
    setSaving(true);
    try {
      await updateScheduleSettings(schoolId, {
        workingDays,
        weekStart,
        timezone,
      });
      toast.success("Settings saved");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  if (!schoolId) {
    return (
      <div className="text-center py-16 text-slate-600">
        Create or join a school first.
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Settings</h1>
        <p className="text-sm text-slate-500 mt-1">
          Working days and schedule defaults for your school.
        </p>
      </div>

      <form
        onSubmit={handleSave}
        className="bg-white rounded-xl border shadow-sm p-6 space-y-6"
      >
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Working days
          </label>
          <div className="flex flex-wrap gap-2">
            {ALL_DAYS.map((day) => {
              const on = workingDays.includes(day);
              return (
                <button
                  key={day}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => toggleDay(day)}
                  className={`px-3 py-1.5 rounded-lg text-sm font-medium border transition ${
                    on
                      ? "text-white border-transparent"
                      : "bg-white text-slate-600 border-slate-200 hover:border-slate-300"
                  }`}
                  style={on ? { backgroundColor: BRAND.blue } : undefined}
                >
                  {day.slice(0, 3)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Week starts on
            </label>
            <select
              value={weekStart}
              onChange={(e) => setWeekStart(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              {ALL_DAYS.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Timezone
            </label>
            <select
              value={timezone}
              onChange={(e) => setTimezone(e.target.value)}
              disabled={!canEdit}
              className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="Africa/Nairobi">Africa/Nairobi (EAT)</option>
              <option value="Africa/Kampala">Africa/Kampala</option>
              <option value="Africa/Dar_es_Salaam">Africa/Dar es Salaam</option>
              <option value="UTC">UTC</option>
            </select>
          </div>
        </div>

        {canEdit && (
          <div className="pt-2">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: BRAND.blue }}
            >
              <Save className="w-4 h-4" />
              {saving ? "Saving…" : "Save settings"}
            </button>
          </div>
        )}

        {!canEdit && (
          <p className="text-sm text-slate-500">
            Only principal or timetable administrator can change settings.
          </p>
        )}
      </form>
    </div>
  );
}
