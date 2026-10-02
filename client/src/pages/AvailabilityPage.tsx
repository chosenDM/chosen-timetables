/**
 * Interactive availability matrix.
 * Teachers / Classes / Learning Areas × Days × Periods
 * States: available | preferred | unavailable
 */

import { useEffect, useState, useMemo } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  listTeachers,
  listClasses,
  listLearningAreas,
  listPeriods,
  listAvailability,
  setAvailability,
  getScheduleSettings,
} from "@/services/schoolService";
import type {
  Teacher,
  SchoolClass,
  LearningArea,
  Period,
  Availability,
  AvailabilityState,
  EntityType,
} from "@shared/types";
import { BRAND } from "@/lib/utils";

const STATE_CYCLE: AvailabilityState[] = ["available", "preferred", "unavailable"];
const STATE_STYLE: Record<AvailabilityState, string> = {
  available: "bg-green-100 text-green-800 border-green-200",
  preferred: "bg-blue-100 text-blue-800 border-blue-200",
  unavailable: "bg-red-100 text-red-800 border-red-200",
};
const STATE_SHORT: Record<AvailabilityState, string> = {
  available: "A",
  preferred: "P",
  unavailable: "U",
};

export default function AvailabilityPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;

  const [entityType, setEntityType] = useState<EntityType>("teacher");
  const [entityId, setEntityId] = useState("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [areas, setAreas] = useState<LearningArea[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [days, setDays] = useState<string[]>(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const [availability, setAvail] = useState<Availability[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      setLoading(true);
      try {
        const [t, c, a, p, av, settings] = await Promise.all([
          listTeachers(schoolId),
          listClasses(schoolId),
          listLearningAreas(schoolId),
          listPeriods(schoolId),
          listAvailability(schoolId),
          getScheduleSettings(schoolId),
        ]);
        setTeachers(t.filter((x) => x.active !== false));
        setClasses(c.filter((x) => x.active !== false));
        setAreas(a.filter((x) => x.active !== false));
        setPeriods(p.filter((x) => x.kind === "lesson").sort((x, y) => x.displayOrder - y.displayOrder));
        setAvail(av);
        if (settings?.workingDays?.length) setDays(settings.workingDays);
      } catch {
        toast.error("Failed to load availability data");
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId]);

  const entities = useMemo(() => {
    if (entityType === "teacher") return teachers.map((t) => ({ id: t.id, label: `${t.fullName} (${t.identifier})` }));
    if (entityType === "class") return classes.map((c) => ({ id: c.id, label: c.name }));
    return areas.map((a) => ({ id: a.id, label: `${a.name} (${a.code})` }));
  }, [entityType, teachers, classes, areas]);

  // Auto-select first entity when type changes
  useEffect(() => {
    if (entities.length && !entities.find((e) => e.id === entityId)) {
      setEntityId(entities[0].id);
    }
  }, [entities, entityId]);

  const getState = (day: string, periodNumber: number): AvailabilityState => {
    const found = availability.find(
      (a) =>
        a.entityType === entityType &&
        a.entityId === entityId &&
        a.dayName === day &&
        a.periodNumber === periodNumber
    );
    return found?.state ?? "available";
  };

  const cycleState = async (day: string, periodNumber: number) => {
    if (!schoolId || !entityId) return;
    const current = getState(day, periodNumber);
    const next = STATE_CYCLE[(STATE_CYCLE.indexOf(current) + 1) % STATE_CYCLE.length];
    setSaving(true);
    try {
      await setAvailability(schoolId, {
        entityType,
        entityId,
        dayName: day,
        periodNumber,
        state: next,
      });
      // Optimistic local update
      setAvail((prev) => {
        const idx = prev.findIndex(
          (a) =>
            a.entityType === entityType &&
            a.entityId === entityId &&
            a.dayName === day &&
            a.periodNumber === periodNumber
        );
        if (idx >= 0) {
          const copy = [...prev];
          copy[idx] = { ...copy[idx], state: next };
          return copy;
        }
        return [
          ...prev,
          {
            id: `temp-${Date.now()}`,
            schoolId,
            entityType,
            entityId,
            dayName: day,
            periodNumber,
            state: next,
            createdAt: new Date().toISOString(),
          },
        ];
      });
    } catch {
      toast.error("Failed to update availability");
    } finally {
      setSaving(false);
    }
  };

  if (!schoolId) {
    return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;
  }

  if (loading) {
    return (
      <div className="flex justify-center py-20">
        <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Availability</h1>
        <p className="text-sm text-slate-500">
          Click a cell to cycle: Available → Preferred → Unavailable. Preferred influences scoring; Unavailable is a hard constraint.
        </p>
      </div>

      {/* Controls */}
      <div className="bg-white rounded-xl border p-4 flex flex-wrap gap-4 items-end">
        <div>
          <label className="block text-xs font-medium text-slate-500 mb-1">Entity type</label>
          <select
            value={entityType}
            onChange={(e) => setEntityType(e.target.value as EntityType)}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            <option value="teacher">Teacher</option>
            <option value="class">Class</option>
            <option value="learning_area">Learning Area</option>
          </select>
        </div>
        <div className="flex-1 min-w-[200px]">
          <label className="block text-xs font-medium text-slate-500 mb-1">Select</label>
          <select
            value={entityId}
            onChange={(e) => setEntityId(e.target.value)}
            className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
          >
            {entities.length === 0 && <option value="">No items yet</option>}
            {entities.map((e) => (
              <option key={e.id} value={e.id}>{e.label}</option>
            ))}
          </select>
        </div>
        <div className="flex gap-3 text-xs">
          <span className={`px-2 py-1 rounded border ${STATE_STYLE.available}`}>A Available</span>
          <span className={`px-2 py-1 rounded border ${STATE_STYLE.preferred}`}>P Preferred</span>
          <span className={`px-2 py-1 rounded border ${STATE_STYLE.unavailable}`}>U Unavailable</span>
        </div>
      </div>

      {periods.length === 0 ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
          Configure lesson periods first (Periods page).
        </div>
      ) : !entityId ? (
        <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
          Add teachers, classes or learning areas first.
        </div>
      ) : (
        <div className="bg-white rounded-xl border overflow-x-auto">
          <table className="w-full text-sm min-w-[640px] border-collapse">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 px-3 py-2 text-left font-medium sticky left-0 bg-slate-50">Day</th>
                {periods.map((p) => (
                  <th key={p.id} className="border border-slate-200 px-2 py-2 text-center font-medium">
                    <div>P{p.periodNumber}</div>
                    <div className="text-[10px] font-normal text-slate-400">{p.startTime}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day) => (
                <tr key={day}>
                  <td className="border border-slate-200 px-3 py-2 font-medium sticky left-0 bg-white">{day}</td>
                  {periods.map((p) => {
                    const state = getState(day, p.periodNumber);
                    return (
                      <td key={p.id} className="border border-slate-200 p-1 text-center">
                        <button
                          type="button"
                          disabled={saving}
                          onClick={() => cycleState(day, p.periodNumber)}
                          className={`w-full min-w-[2.5rem] py-2 rounded border text-xs font-bold transition-colors ${STATE_STYLE[state]} hover:opacity-80 disabled:opacity-50`}
                          title={`Click to change (${state})`}
                        >
                          {STATE_SHORT[state]}
                        </button>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
