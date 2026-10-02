import { Outlet, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { BRAND } from "@/lib/utils";
import {
  LayoutDashboard,
  Building2,
  Users,
  GraduationCap,
  BookOpen,
  Clock,
  Calendar,
  FileText,
  Settings,
  LogOut,
  CreditCard,
  Menu,
  X,
} from "lucide-react";
import { useState } from "react";
import { SchoolStatusGate } from "@/components/SchoolStatusGate";
import { canAccessModule, isFullAdmin } from "@/lib/roles";
import type { UserRole } from "@shared/types";

const navItems: {
  to: string;
  label: string;
  icon: typeof LayoutDashboard;
  end?: boolean;
  module: string;
  adminOnly?: boolean;
}[] = [
  { to: "/app", label: "Dashboard", icon: LayoutDashboard, end: true, module: "dashboard" },
  { to: "/app/school", label: "School Profile", icon: Building2, module: "school", adminOnly: true },
  { to: "/app/departments", label: "Departments", icon: Users, module: "departments", adminOnly: true },
  { to: "/app/teachers", label: "Teachers", icon: GraduationCap, module: "teachers" },
  { to: "/app/classes", label: "Classes", icon: Users, module: "classes" },
  { to: "/app/learning-areas", label: "Learning Areas", icon: BookOpen, module: "learning-areas" },
  { to: "/app/periods", label: "Periods", icon: Clock, module: "periods", adminOnly: true },
  { to: "/app/availability", label: "Availability", icon: Calendar, module: "availability", adminOnly: true },
  { to: "/app/allocations", label: "Allocations", icon: FileText, module: "allocations" },
  { to: "/app/electives", label: "Joint Electives", icon: BookOpen, module: "allocations" },
  { to: "/app/joint-classes", label: "Joint Classes", icon: Users, module: "classes" },
  { to: "/app/timetables", label: "Timetables", icon: Calendar, module: "timetables" },
  { to: "/app/exams", label: "Exam Timetable", icon: FileText, module: "exams", adminOnly: true },
  { to: "/app/remedial", label: "Remedial", icon: FileText, module: "remedial", adminOnly: true },
  { to: "/app/reports", label: "Reports", icon: FileText, module: "reports" },
  { to: "/app/users", label: "Users", icon: Users, module: "users", adminOnly: true },
  { to: "/app/billing", label: "Billing", icon: CreditCard, module: "billing", adminOnly: true },
  { to: "/app/settings", label: "Settings", icon: Settings, module: "settings", adminOnly: true },
];

export default function DashboardLayout() {
  const { user, schoolUser, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileOpen, setMobileOpen] = useState(false);
  const role = schoolUser?.role as UserRole | undefined;
  const visibleNav = navItems.filter((item) => {
    if (item.adminOnly && !isFullAdmin(role)) return false;
    return canAccessModule(role, item.module);
  });

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  return (
    <div className="min-h-screen flex bg-slate-50">
      {/* Sidebar – desktop */}
      <aside className="hidden lg:flex lg:flex-col w-64 border-r bg-white">
        <div className="h-16 flex items-center gap-2 px-5 border-b">
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
            style={{ backgroundColor: BRAND.blue }}
          >
            CT
          </div>
          <span className="font-semibold text-slate-900 truncate">Chosen Time Tables</span>
        </div>
        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-0.5">
          {visibleNav.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? "bg-brand-blue/10 text-brand-blue"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-900"
                }`
              }
            >
              <item.icon className="w-4 h-4 shrink-0" />
              {item.label}
            </NavLink>
          ))}
        </nav>
        <div className="border-t p-4">
          <div className="text-xs text-slate-500 truncate mb-2">
            {schoolUser?.displayName || user?.email}
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 text-sm text-slate-600 hover:text-red-600 w-full"
          >
            <LogOut className="w-4 h-4" />
            Log out
          </button>
        </div>
      </aside>

      {/* Mobile header */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="lg:hidden h-14 border-b bg-white flex items-center justify-between px-4 sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: BRAND.blue }}
            >
              CT
            </div>
            <span className="font-semibold text-sm">Chosen Time Tables</span>
          </div>
          <button
            onClick={() => setMobileOpen(!mobileOpen)}
            className="p-2 rounded-lg hover:bg-slate-100"
            aria-label="Toggle menu"
          >
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </header>

        {/* Mobile nav drawer */}
        {mobileOpen && (
          <div className="lg:hidden fixed inset-0 z-30 bg-black/40" onClick={() => setMobileOpen(false)}>
            <div
              className="absolute left-0 top-0 bottom-0 w-72 bg-white shadow-xl overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="h-14 flex items-center px-4 border-b font-semibold">Menu</div>
              <nav className="p-3 space-y-0.5">
                {visibleNav.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={() => setMobileOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium ${
                        isActive ? "bg-brand-blue/10 text-brand-blue" : "text-slate-600"
                      }`
                    }
                  >
                    <item.icon className="w-4 h-4" />
                    {item.label}
                  </NavLink>
                ))}
                <button
                  onClick={handleLogout}
                  className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium text-red-600 w-full"
                >
                  <LogOut className="w-4 h-4" />
                  Log out
                </button>
              </nav>
            </div>
          </div>
        )}

        <main className="flex-1 p-4 md:p-6 overflow-auto">
          <SchoolStatusGate>
            <Outlet />
          </SchoolStatusGate>
        </main>
      </div>
    </div>
  );
}
