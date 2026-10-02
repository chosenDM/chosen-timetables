/**
 * Reports: Class summary + Teacher workload from real timetable data.
 */

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import {
  getLatestTimetable,
  getTimetableEntries,
} from "@/services/timetableService";
import {
  listTeachers,
  listClasses,
  listLearningAreas,
  listAllocations,
  listPeriods,
  getScheduleSettings,
} from "@/services/schoolService";
import type {
  Teacher,
  SchoolClass,
  LearningArea,
  Allocation,
  Period,
  TimetableEntry,
} from "@shared/types";
import { BRAND } from "@/lib/utils";
import { downloadCsv, downloadPdf, buildListPdfBytes } from "@/lib/exportUtils";
import { isFullAdmin, isHod, filterByHodDepartment } from "@/lib/roles";
import { FileSpreadsheet } from "lucide-react";

type Tab = "class_summary" | "workload";

export default function ReportsPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;

  const [tab, setTab] = useState<Tab>("class_summary");
  const [loading, setLoading] = useState(true);
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [classes, setClasses] = useState<SchoolClass[]>([]);
  const [areas, setAreas] = useState<LearningArea[]>([]);
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [entries, setEntries] = useState<TimetableEntry[]>([]);
  const [periods, setPeriods] = useState<Period[]>([]);
  const [days, setDays] = useState<string[]>(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
  const [filterClassId, setFilterClassId] = useState("");

  useEffect(() => {
    if (!schoolId) return;
    (async () => {
      setLoading(true);
      try {
        const [t, c, a, alloc, p, settings, latest] = await Promise.all([
          listTeachers(schoolId),
          listClasses(schoolId),
          listLearningAreas(schoolId),
          listAllocations(schoolId),
          listPeriods(schoolId),
          getScheduleSettings(schoolId),
          getLatestTimetable(schoolId),
        ]);
        setTeachers(/*hod-filter*/t.filter((x) => x.active !== false));
        setClasses(c.filter((x) => x.active !== false));
        setAreas(a.filter((x) => x.active !== false));
        setAllocations(alloc.filter((x) => x.status === "approved"));
        setPeriods(p.filter((x) => x.kind === "lesson"));
        if (settings?.workingDays?.length) setDays(settings.workingDays);
        if (latest) {
          const ents = await getTimetableEntries(schoolId, latest.id);
          setEntries(ents);
        }
      } catch {
        toast.error("Failed to load report data");
      } finally {
        setLoading(false);
      }
    })();
  }, [schoolId]);

  const classSummary = useMemo(() => {
    const rows: {
      classId: string;
      className: string;
      learningAreaId: string;
      subject: string;
      teacherId: string;
      teacher: string;
      required: number;
      scheduled: number;
      remaining: number;
      doubles: number;
    }[] = [];

    const relevantAlloc = filterClassId
      ? allocations.filter((a) => a.classId === filterClassId)
      : allocations;

    for (const a of relevantAlloc) {
      const cls = classes.find((c) => c.id === a.classId);
      const area = areas.find((x) => x.id === a.learningAreaId);
      const teacher = teachers.find((t) => t.id === a.teacherId);
      const scheduled = entries.filter(
        (e) =>
          e.classId === a.classId &&
          e.learningAreaId === a.learningAreaId &&
          e.teacherId === a.teacherId
      ).length;
      const doubles = entries.filter(
        (e) =>
          e.classId === a.classId &&
          e.learningAreaId === a.learningAreaId &&
          e.teacherId === a.teacherId &&
          e.lessonType === "double"
      ).length;
      rows.push({
        classId: a.classId,
        className: cls?.name || a.classId,
        learningAreaId: a.learningAreaId,
        subject: area?.name || a.learningAreaId,
        teacherId: a.teacherId,
        teacher: teacher ? `${teacher.fullName} (${teacher.identifier})` : a.teacherId,
        required: a.lessonsPerWeek,
        scheduled,
        remaining: Math.max(0, a.lessonsPerWeek - scheduled),
        doubles: Math.floor(doubles / 2) || a.doubleLessons,
      });
    }
    return rows.sort((x, y) => x.className.localeCompare(y.className) || x.subject.localeCompare(y.subject));
  }, [allocations, entries, classes, areas, teachers, filterClassId]);

  const role = schoolUser?.role;
  const hodDeptId = schoolUser?.departmentId;
  const visibleTeachers = filterByHodDepartment(teachers, role, hodDeptId);

  const workload = useMemo(() => {
    const lessonCount = periods.length * days.length;
    return visibleTeachers.map((t) => {
      const tEntries = entries.filter((e) => e.teacherId === t.id);
      const byDay: Record<string, number> = {};
      for (const d of days) byDay[d] = 0;
      for (const e of tEntries) {
        byDay[e.dayName] = (byDay[e.dayName] || 0) + 1;
      }
      const doubles = tEntries.filter((e) => e.lessonType === "double").length;
      // Consecutive: count pairs of adjacent lesson periods same day
      let consecutive = 0;
      for (const d of days) {
        const nums = tEntries
          .filter((e) => e.dayName === d)
          .map((e) => e.periodNumber)
          .sort((a, b) => a - b);
        for (let i = 0; i < nums.length - 1; i++) {
          if (nums[i + 1] === nums[i] + 1) consecutive++;
        }
      }
      return {
        teacherId: t.id,
        name: t.fullName,
        identifier: t.identifier,
        lessonsPerWeek: tEntries.length,
        freePeriods: Math.max(0, lessonCount - tEntries.length),
        doubles: Math.floor(doubles / 2),
        consecutive,
        byDay,
      };
    }).sort((a, b) => b.lessonsPerWeek - a.lessonsPerWeek);
  }, [visibleTeachers, entries, periods, days]);

  const exportClassCsv = () => {
    const rows = [
      ["Class", "Subject", "Teacher", "Required", "Scheduled", "Remaining", "Doubles"],
      ...classSummary.map((r) => [
        r.className,
        r.subject,
        r.teacher,
        String(r.required),
        String(r.scheduled),
        String(r.remaining),
        String(r.doubles),
      ]),
    ];
    downloadCsv("class-summary.csv", rows);
    toast.success("CSV downloaded");
  };

  const exportWorkloadCsv = () => {
    const rows = [
      ["Teacher", "ID", "Lessons/week", "Free periods", "Doubles", "Consecutive pairs", ...days],
      ...workload.map((w) => [
        w.name,
        w.identifier,
        String(w.lessonsPerWeek),
        String(w.freePeriods),
        String(w.doubles),
        String(w.consecutive),
        ...days.map((d) => String(w.byDay[d] || 0)),
      ]),
    ];
    downloadCsv("teacher-workload.csv", rows);
    toast.success("CSV downloaded");
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
        <h1 className="text-2xl font-bold text-slate-900">Reports</h1>
        <p className="text-sm text-slate-500">
          Built from approved allocations and the latest generated timetable
        </p>
      </div>

      <div className="flex gap-2 border-b">
        <TabBtn active={tab === "class_summary"} onClick={() => setTab("class_summary")}>
          Class summary
        </TabBtn>
        <TabBtn active={tab === "workload"} onClick={() => setTab("workload")}>
          Teacher workload
        </TabBtn>
      </div>

      {tab === "class_summary" && (
        <div className="space-y-4">
          <div className="flex flex-wrap gap-3 items-end">
            <div>
              <label className="block text-xs text-slate-500 mb-1">Filter class</label>
              <select
                value={filterClassId}
                onChange={(e) => setFilterClassId(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All classes</option>
                {classes.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
              </select>
            </div>
            <button
              onClick={exportClassCsv}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" /> CSV
            </button>
          </div>

          {classSummary.length === 0 ? (
            <Empty msg="No approved allocations or timetable yet." />
          ) : (
            <div className="bg-white rounded-xl border overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Class</th>
                    <th className="px-4 py-3 font-medium">Subject</th>
                    <th className="px-4 py-3 font-medium">Teacher</th>
                    <th className="px-4 py-3 font-medium">Required</th>
                    <th className="px-4 py-3 font-medium">Scheduled</th>
                    <th className="px-4 py-3 font-medium">Remaining</th>
                    <th className="px-4 py-3 font-medium">Doubles</th>
                  </tr>
                </thead>
                <tbody>
                  {classSummary.map((r, i) => (
                    <tr key={i} className="border-t">
                      <td className="px-4 py-2 font-medium">{r.className}</td>
                      <td className="px-4 py-2">{r.subject}</td>
                      <td className="px-4 py-2 text-slate-600">{r.teacher}</td>
                      <td className="px-4 py-2">{r.required}</td>
                      <td className="px-4 py-2">{r.scheduled}</td>
                      <td className={`px-4 py-2 font-medium ${r.remaining > 0 ? "text-amber-700" : "text-green-700"}`}>
                        {r.remaining}
                      </td>
                      <td className="px-4 py-2">{r.doubles}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {tab === "workload" && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={exportWorkloadCsv}
              className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium"
            >
              <FileSpreadsheet className="w-4 h-4" /> CSV
            </button>
          </div>
          {workload.length === 0 ? (
            <Empty msg="No teachers or timetable data." />
          ) : (
            <div className="bg-white rounded-xl border overflow-x-auto">
              <table className="w-full text-sm min-w-[800px]">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Teacher</th>
                    <th className="px-4 py-3 font-medium">Lessons/wk</th>
                    <th className="px-4 py-3 font-medium">Free</th>
                    <th className="px-4 py-3 font-medium">Doubles</th>
                    <th className="px-4 py-3 font-medium">Consecutive</th>
                    {days.map((d) => (
                      <th key={d} className="px-2 py-3 font-medium text-center">{d.slice(0, 3)}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {workload.map((w) => (
                    <tr key={w.teacherId} className="border-t">
                      <td className="px-4 py-2">
                        <span className="font-medium">{w.name}</span>
                        <span className="text-xs text-slate-400 ml-1">({w.identifier})</span>
                      </td>
                      <td className="px-4 py-2 font-medium">{w.lessonsPerWeek}</td>
                      <td className="px-4 py-2 text-slate-600">{w.freePeriods}</td>
                      <td className="px-4 py-2">{w.doubles}</td>
                      <td className="px-4 py-2">{w.consecutive}</td>
                      {days.map((d) => (
                        <td key={d} className="px-2 py-2 text-center text-slate-600">
                          {w.byDay[d] || 0}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function TabBtn({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
        active ? "border-brand-blue text-brand-blue" : "border-transparent text-slate-600"
      }`}
    >
      {children}
    </button>
  );
}

function Empty({ msg }: { msg: string }) {
  return (
    <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
      {msg}
    </div>
  );
}
