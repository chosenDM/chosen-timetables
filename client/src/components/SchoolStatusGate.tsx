/**
 * Blocks school workspace when accountStatus === suspended.
 * Platform admin can still use /platform.
 */

import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { getSchool } from "@/services/schoolService";
import type { School } from "@shared/types";
import { BRAND } from "@/lib/utils";

export function SchoolStatusGate({ children }: { children: ReactNode }) {
  const { schoolUser } = useAuth();
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(!!schoolUser?.schoolId);

  useEffect(() => {
    if (!schoolUser?.schoolId) {
      setLoading(false);
      return;
    }
    getSchool(schoolUser.schoolId)
      .then(setSchool)
      .catch(() => setSchool(null))
      .finally(() => setLoading(false));
  }, [schoolUser?.schoolId]);

  if (loading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <div className="w-8 h-8 border-4 border-brand-blue border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (school?.accountStatus === "suspended") {
    return (
      <div className="max-w-lg mx-auto mt-16 text-center px-4">
        <div className="bg-white rounded-2xl border border-red-200 p-8 shadow-sm">
          <h1 className="text-xl font-bold text-red-800 mb-2">School suspended</h1>
          <p className="text-sm text-slate-600 mb-2">
            Access to this school workspace is temporarily blocked. Your data is safe and has not been deleted.
          </p>
          {school.suspensionReason && (
            <p className="text-sm text-red-700 bg-red-50 rounded-lg px-3 py-2 mb-4">
              Reason: {school.suspensionReason}
            </p>
          )}
          <p className="text-xs text-slate-500 mb-4">
            Contact Chosen Digital Solutions to resolve this.
          </p>
          <Link
            to="/"
            className="inline-flex px-4 py-2 rounded-lg text-white text-sm font-medium"
            style={{ backgroundColor: BRAND.blue }}
          >
            Go home
          </Link>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
