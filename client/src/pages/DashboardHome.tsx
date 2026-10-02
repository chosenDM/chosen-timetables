import { useAuth } from "@/contexts/AuthContext";
import { BRAND } from "@/lib/utils";
import { Link } from "react-router-dom";

export default function DashboardHome() {
  const { user, schoolUser } = useAuth();

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Dashboard</h1>
        <p className="text-slate-600 mt-1">
          Welcome{schoolUser?.displayName ? `, ${schoolUser.displayName}` : ""}.
          {schoolUser
            ? ` You are signed in as ${schoolUser.role.replace("_", " ")}.`
            : " Complete school setup to begin."}
        </p>
      </div>

      {!schoolUser && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5">
          <h2 className="font-semibold text-amber-900 mb-1">School not linked yet</h2>
          <p className="text-sm text-amber-800 mb-3">
            Create or join a school to access departments, teachers, allocations and timetable generation.
          </p>
          <Link
            to="/app/school"
            className="inline-flex items-center px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: BRAND.blue }}
          >
            Set up school
          </Link>
        </div>
      )}

      <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { title: "Departments", desc: "Organise subjects by department", to: "/app/departments" },
          { title: "Teachers", desc: "Staff and identifiers", to: "/app/teachers" },
          { title: "Classes", desc: "Forms and streams", to: "/app/classes" },
          { title: "Learning Areas", desc: "Subjects and lesson requirements", to: "/app/learning-areas" },
          { title: "Allocations", desc: "HOD workflow and approvals", to: "/app/allocations" },
          { title: "Timetables", desc: "Generate, edit and export", to: "/app/timetables" },
        ].map((card) => (
          <Link
            key={card.to}
            to={card.to}
            className="block rounded-xl border bg-white p-5 hover:border-brand-blue/40 hover:shadow-sm transition-all"
          >
            <h3 className="font-semibold text-slate-900">{card.title}</h3>
            <p className="text-sm text-slate-500 mt-1">{card.desc}</p>
          </Link>
        ))}
      </div>

      <div className="rounded-xl border bg-white p-5 text-sm text-slate-600">
        <p>
          Signed in as <strong>{user?.email}</strong>
        </p>
        <p className="mt-1 text-xs text-slate-400">
          Phase 1 foundation active · Firebase Auth · Firestore-ready models · Engine preserved
        </p>
      </div>
    </div>
  );
}
