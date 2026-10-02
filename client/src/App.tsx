import { Routes, Route, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import LandingPage from "@/pages/LandingPage";
import LoginPage from "@/pages/LoginPage";
import RegisterPage from "@/pages/RegisterPage";
import ForgotPasswordPage from "@/pages/ForgotPasswordPage";
import DashboardLayout from "@/components/DashboardLayout";
import DashboardHome from "@/pages/DashboardHome";
import SchoolProfilePage from "@/pages/SchoolProfilePage";
import DepartmentsPage from "@/pages/DepartmentsPage";
import TeachersPage from "@/pages/TeachersPage";
import ClassesPage from "@/pages/ClassesPage";
import LearningAreasPage from "@/pages/LearningAreasPage";
import PeriodsPage from "@/pages/PeriodsPage";
import AvailabilityPage from "@/pages/AvailabilityPage";
import AllocationsPage from "@/pages/AllocationsPage";
import TimetablesPage from "@/pages/TimetablesPage";
import ExamTimetablePage from "@/pages/ExamTimetablePage";
import ElectiveSessionsPage from "@/pages/ElectiveSessionsPage";
import JointClassesPage from "@/pages/JointClassesPage";
import RemedialPage from "@/pages/RemedialPage";
import BillingPage from "@/pages/BillingPage";
import ReportsPage from "@/pages/ReportsPage";
import UsersPage from "@/pages/UsersPage";
import SettingsPage from "@/pages/SettingsPage";
import PlatformAdminPage from "@/pages/platform/PlatformAdminPage";
import NotFound from "@/pages/NotFound";

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="w-10 h-10 border-4 border-brand-blue border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-slate-600 text-sm">Loading…</p>
        </div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return <>{children}</>;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/register" element={<RegisterPage />} />
      <Route path="/forgot-password" element={<ForgotPasswordPage />} />

      <Route
        path="/app"
        element={
          <ProtectedRoute>
            <DashboardLayout />
          </ProtectedRoute>
        }
      >
        <Route index element={<DashboardHome />} />
        <Route path="school" element={<SchoolProfilePage />} />
        <Route path="departments" element={<DepartmentsPage />} />
        <Route path="teachers" element={<TeachersPage />} />
        <Route path="classes" element={<ClassesPage />} />
        <Route path="learning-areas" element={<LearningAreasPage />} />
        <Route path="periods" element={<PeriodsPage />} />
        <Route path="availability" element={<AvailabilityPage />} />
        <Route path="allocations" element={<AllocationsPage />} />
        <Route path="electives" element={<ElectiveSessionsPage />} />
        <Route path="joint-classes" element={<JointClassesPage />} />
        <Route path="timetables" element={<TimetablesPage />} />
        <Route path="exams" element={<ExamTimetablePage />} />
        <Route path="remedial" element={<RemedialPage />} />
        <Route path="billing" element={<BillingPage />} />
        <Route path="reports" element={<ReportsPage />} />
        <Route path="users" element={<UsersPage />} />
        <Route path="settings" element={<SettingsPage />} />
      </Route>

      <Route
        path="/platform"
        element={
          <ProtectedRoute>
            <PlatformAdminPage />
          </ProtectedRoute>
        }
      />
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
