/**
 * Billing page — plans and status.
 * Paystack checkout/verify via Cloud Functions (secret key never in frontend).
 */

import { useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { httpsCallable } from "firebase/functions";
import { useAuth } from "@/contexts/AuthContext";
import { functions } from "@/lib/firebase";
import { getSchool } from "@/services/schoolService";
import type { School } from "@shared/types";
import { BRAND } from "@/lib/utils";
import { CreditCard, Check, Loader2 } from "lucide-react";

export default function BillingPage() {
  const { schoolUser } = useAuth();
  const schoolId = schoolUser?.schoolId;
  const [school, setSchool] = useState<School | null>(null);
  const [loading, setLoading] = useState(true);
  const [paying, setPaying] = useState<string | null>(null);
  const [termlyPrice, setTermlyPrice] = useState(500);
  const [yearlyPrice, setYearlyPrice] = useState(1400);
  const [lifetimePrice, setLifetimePrice] = useState(5000);

  useEffect(() => {
    (async () => {
      try {
        const fn = httpsCallable(functions, "getPublicPlans");
        const res = await fn({});
        const d = res.data as {
          monthlyPriceKes?: number;
          termlyPriceKes?: number;
          yearlyPriceKes?: number;
          lifetimePriceKes?: number;
        };
        if (d.termlyPriceKes) setTermlyPrice(d.termlyPriceKes);
        else if (d.monthlyPriceKes) setTermlyPrice(d.monthlyPriceKes);
        if (d.yearlyPriceKes) setYearlyPrice(d.yearlyPriceKes);
        if (d.lifetimePriceKes) setLifetimePrice(d.lifetimePriceKes);
      } catch {
        /* defaults */
      }
    })();
  }, []);

  const PLANS = [
    {
      id: "termly" as const,
      name: "Termly",
      price: `KSh ${termlyPrice.toLocaleString()}`,
      period: "/ term",
      features: ["Full timetable generation", "All modules", "PDF & CSV export", "HOD workflow"],
    },
    {
      id: "yearly" as const,
      name: "Yearly",
      price: `KSh ${yearlyPrice.toLocaleString()}`,
      period: "/ year",
      features: ["Everything in Termly", "12 months access", "Priority email support"],
    },
    {
      id: "lifetime" as const,
      name: "Lifetime",
      price: `KSh ${lifetimePrice.toLocaleString()}`,
      period: "one-time",
      features: ["Everything in Yearly", "Lifetime access", "Priority support", "No renewals"],
    },
  ];
  const [verifying, setVerifying] = useState(false);
  const [searchParams, setSearchParams] = useSearchParams();

  const refreshSchool = async () => {
    if (!schoolId) return;
    const s = await getSchool(schoolId);
    setSchool(s);
  };

  useEffect(() => {
    if (!schoolId) {
      setLoading(false);
      return;
    }
    refreshSchool()
      .catch(() => toast.error("Failed to load billing status"))
      .finally(() => setLoading(false));
  }, [schoolId]);

  // After Paystack redirect: ?reference=...&schoolId=...
  useEffect(() => {
    const reference = searchParams.get("reference");
    const sid = searchParams.get("schoolId") || schoolId;
    if (!reference || !sid) return;

    (async () => {
      setVerifying(true);
      try {
        const verify = httpsCallable(functions, "verifyPayment");
        const result = await verify({ schoolId: sid, reference });
        const data = result.data as { success: boolean; alreadyProcessed?: boolean; plan?: string };
        if (data.success) {
          toast.success(
            data.alreadyProcessed
              ? "Payment already confirmed"
              : `Payment successful — ${data.plan} plan activated`
          );
          await refreshSchool();
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : "Verification failed";
        toast.error(msg);
      } finally {
        setVerifying(false);
        // Clear query params
        setSearchParams({});
      }
    })();
  }, [searchParams.get("reference")]);

  const handleCheckout = async (plan: "monthly" | "lifetime") => {
    if (!schoolId) return;
    setPaying(plan);
    try {
      const init = httpsCallable(functions, "initPayment");
      const result = await init({ schoolId, plan });
      const data = result.data as { authorizationUrl: string; reference: string };
      if (!data.authorizationUrl) {
        throw new Error("No authorization URL returned");
      }
      // Redirect to Paystack checkout
      window.location.href = data.authorizationUrl;
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Could not start payment";
      toast.error(msg);
      setPaying(null);
    }
  };

  if (!schoolId) {
    return <div className="text-center py-16 text-slate-600">Create or join a school first.</div>;
  }

  if (loading || verifying) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
        <p className="text-sm text-slate-500">{verifying ? "Confirming payment…" : "Loading…"}</p>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Billing</h1>
        <p className="text-sm text-slate-500">Manage your school subscription via Paystack</p>
      </div>

      <div className="bg-white rounded-xl border p-5">
        <h2 className="font-semibold mb-3">Current plan</h2>
        <div className="grid sm:grid-cols-3 gap-4 text-sm">
          <div>
            <p className="text-slate-500">Plan</p>
            <p className="font-medium capitalize">{school?.plan || "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Payment status</p>
            <p className="font-medium capitalize">{school?.paymentStatus || "—"}</p>
          </div>
          <div>
            <p className="text-slate-500">Account</p>
            <p className="font-medium capitalize">{school?.accountStatus || "—"}</p>
          </div>
        </div>
        {school?.plan === "trial" && school.trialEnd && (
          <p className="mt-3 text-sm text-amber-700">
            Trial ends {new Date(school.trialEnd).toLocaleDateString()}
          </p>
        )}
      </div>

      <div className="grid sm:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.id}
            className={`rounded-xl border p-6 bg-white ${
              school?.plan === plan.id && school?.paymentStatus === "paid" ? "ring-2 ring-brand-blue" : ""
            }`}
          >
            <h3 className="text-lg font-bold text-slate-900">{plan.name}</h3>
            <p className="mt-2">
              <span className="text-3xl font-bold" style={{ color: BRAND.blue }}>
                {plan.price}
              </span>
              <span className="text-slate-500 text-sm ml-1">{plan.period}</span>
            </p>
            <ul className="mt-4 space-y-2">
              {plan.features.map((f) => (
                <li key={f} className="flex items-center gap-2 text-sm text-slate-600">
                  <Check className="w-4 h-4 text-green-600 shrink-0" />
                  {f}
                </li>
              ))}
            </ul>
            <button
              onClick={() => handleCheckout(plan.id)}
              disabled={
                !!paying ||
                (school?.plan === plan.id && school?.paymentStatus === "paid")
              }
              className="mt-6 w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-lg text-white text-sm font-medium disabled:opacity-50"
              style={{ backgroundColor: BRAND.blue }}
            >
              {paying === plan.id ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" /> Redirecting…
                </>
              ) : school?.plan === plan.id && school?.paymentStatus === "paid" ? (
                "Current plan"
              ) : (
                <>
                  <CreditCard className="w-4 h-4" /> Pay {plan.price}
                </>
              )}
            </button>
          </div>
        ))}
      </div>

      <p className="text-xs text-slate-400 text-center">
        Payments are processed securely via Paystack. The secret key never leaves Cloud Functions.
        Webhooks activate plans even if the browser is closed after payment.
      </p>
    </div>
  );
}
