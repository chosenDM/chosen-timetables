/**
 * Platform owner admin — Chosen Digital Solutions
 * Separate from school dashboard. Requires platform admin UID.
 */

import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { httpsCallable } from "firebase/functions";
import { functions } from "@/lib/firebase";
import { useAuth } from "@/contexts/AuthContext";
import { BRAND } from "@/lib/utils";
import {
  Search,
  Ban,
  CheckCircle,
  Settings,
  ScrollText,
  Building2,
  CreditCard,
  Loader2,
  ArrowLeft,
} from "lucide-react";

interface SchoolRow {
  id: string;
  name?: string;
  contactEmail?: string;
  phone?: string;
  county?: string;
  plan?: string;
  paymentStatus?: string;
  accountStatus?: string;
  createdAt?: string;
  suspensionReason?: string;
}

interface Stats {
  total: number;
  active: number;
  suspended: number;
  trial: number;
  monthly: number;
  lifetime: number;
  paid: number;
}

export default function PlatformAdminPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"schools" | "payments" | "settings" | "audit">("schools");
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [stats, setStats] = useState<Stats | null>(null);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [loading, setLoading] = useState(true);
  const [denied, setDenied] = useState(false);
  const [acting, setActing] = useState<string | null>(null);

  // Settings form
  const [publicKey, setPublicKey] = useState("");
  const [secretKey, setSecretKey] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [appUrl, setAppUrl] = useState("");
  const [secretMasked, setSecretMasked] = useState<string | null>(null);
  const [webhookMasked, setWebhookMasked] = useState<string | null>(null);
  const [savingSettings, setSavingSettings] = useState(false);
  const [termlyPrice, setTermlyPrice] = useState(500);
  const [yearlyPrice, setYearlyPrice] = useState(1400);
  const [lifetimePrice, setLifetimePrice] = useState(5000);
  const [adminEmailsText, setAdminEmailsText] = useState("");

  // Manual subscription grant modal
  const [grantSchool, setGrantSchool] = useState<SchoolRow | null>(null);
  const [grantPlan, setGrantPlan] = useState("termly");
  const [grantExpiry, setGrantExpiry] = useState("");
  const [grantRef, setGrantRef] = useState("");
  const [grantNote, setGrantNote] = useState("");
  const [granting, setGranting] = useState(false);

  // Audit
  const [auditEntries, setAuditEntries] = useState<any[]>([]);

  // Payments
  const [paymentRows, setPaymentRows] = useState<any[]>([]);
  const [paymentStats, setPaymentStats] = useState<{
    total: number;
    paid: number;
    pending: number;
    failed: number;
    revenueKes: number;
  } | null>(null);
  const [paymentSearch, setPaymentSearch] = useState("");
  const [paymentStatus, setPaymentStatus] = useState("");
  const [paymentsLoading, setPaymentsLoading] = useState(false);

  const loadSchools = async () => {
    setLoading(true);
    setDenied(false);
    try {
      const fn = httpsCallable(functions, "listSchools");
      const res = await fn({
        search: search || undefined,
        status: statusFilter || undefined,
      });
      const data = res.data as { schools: SchoolRow[]; stats: Stats };
      setSchools(data.schools || []);
      setStats(data.stats || null);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed";
      if (msg.includes("permission") || msg.includes("admin")) {
        setDenied(true);
      } else {
        toast.error(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const loadSettings = async () => {
    try {
      const fn = httpsCallable(functions, "getPlatformSettings");
      const res = await fn({});
      const data = res.data as any;
      setPublicKey(data.paystackPublicKey || "");
      setAppUrl(data.appUrl || "");
      setSecretMasked(data.paystackSecretKeyMasked);
      setWebhookMasked(data.paystackWebhookSecretMasked);
      setSecretKey("");
      setWebhookSecret("");
      setTermlyPrice(
        Number(data.termlyPriceKes) > 0
          ? Number(data.termlyPriceKes)
          : Number(data.monthlyPriceKes) > 0
            ? Number(data.monthlyPriceKes)
            : 500
      );
      setYearlyPrice(Number(data.yearlyPriceKes) > 0 ? Number(data.yearlyPriceKes) : 1400);
      setLifetimePrice(Number(data.lifetimePriceKes) > 0 ? Number(data.lifetimePriceKes) : 5000);
      setAdminEmailsText(Array.isArray(data.adminEmails) ? data.adminEmails.join(", ") : "");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load settings");
    }
  };

  const loadAudit = async () => {
    try {
      const fn = httpsCallable(functions, "listPlatformAudit");
      const res = await fn({ limit: 50 });
      const data = res.data as { entries: any[] };
      setAuditEntries(data.entries || []);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load audit");
    }
  };

  const loadPayments = async () => {
    setPaymentsLoading(true);
    try {
      const fn = httpsCallable(functions, "listPlatformPayments");
      const res = await fn({
        search: paymentSearch || undefined,
        status: paymentStatus || undefined,
      });
      const data = res.data as { payments: any[]; stats: any };
      setPaymentRows(data.payments || []);
      setPaymentStats(data.stats || null);
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to load payments");
    } finally {
      setPaymentsLoading(false);
    }
  };

  useEffect(() => {
    if (tab === "schools") loadSchools();
    if (tab === "payments") loadPayments();
    if (tab === "settings") loadSettings();
    if (tab === "audit") loadAudit();
  }, [tab]);

  
  const submitGrant = async () => {
    if (!grantSchool) return;
    setGranting(true);
    try {
      const fn = httpsCallable(functions, "grantManualSubscription");
      await fn({
        schoolId: grantSchool.id,
        plan: grantPlan,
        expiryDate: grantExpiry || undefined,
        paymentReference: grantRef || undefined,
        note: grantNote || undefined,
      });
      toast.success(`Granted ${grantPlan} to ${grantSchool.name || grantSchool.id}`);
      setGrantSchool(null);
      setGrantRef("");
      setGrantNote("");
      setGrantExpiry("");
      loadSchools();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Grant failed");
    } finally {
      setGranting(false);
    }
  };

  const handleSuspend = async (schoolId: string, name?: string) => {
    const reason = prompt(`Suspend “${name || schoolId}”? Enter reason:`);
    if (reason === null) return;
    setActing(schoolId);
    try {
      const fn = httpsCallable(functions, "suspendSchool");
      await fn({ schoolId, reason: reason || "Suspended by platform admin" });
      toast.success("School suspended");
      await loadSchools();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null);
    }
  };

  const handleActivate = async (schoolId: string) => {
    if (!confirm("Activate this school?")) return;
    setActing(schoolId);
    try {
      const fn = httpsCallable(functions, "activateSchool");
      await fn({ schoolId });
      toast.success("School activated");
      await loadSchools();
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setActing(null);
    }
  };

  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingSettings(true);
    try {
      const fn = httpsCallable(functions, "updatePlatformSettings");
      const payload: Record<string, unknown> = {
        paystackPublicKey: publicKey,
        appUrl,
        termlyPriceKes: termlyPrice,
        yearlyPriceKes: yearlyPrice,
        lifetimePriceKes: lifetimePrice,
        monthlyPriceKes: termlyPrice,
        adminEmails: adminEmailsText
          .split(",")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean),
      };
      if (secretKey.trim()) payload.paystackSecretKey = secretKey.trim();
      if (webhookSecret.trim()) payload.paystackWebhookSecret = webhookSecret.trim();
      const res = await fn(payload);
      const data = res.data as any;
      setSecretMasked(data.paystackSecretKeyMasked);
      setWebhookMasked(data.paystackWebhookSecretMasked);
      setSecretKey("");
      setWebhookSecret("");
      toast.success("Settings saved (secrets masked)");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Save failed");
    } finally {
      setSavingSettings(false);
    }
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-slate-600">Sign in required</p>
      </div>
    );
  }

  if (denied) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
        <div className="text-center max-w-md">
          <h1 className="text-xl font-bold text-slate-900 mb-2">Access denied</h1>
          <p className="text-sm text-slate-600 mb-3">
            This account is not listed as a platform owner. Access uses your <strong>Firebase Auth UID</strong>
            and/or your <strong>email</strong> — not the school role.
          </p>
          <div className="text-left text-xs bg-slate-50 border rounded-lg p-3 mb-4 space-y-1">
            <p><span className="text-slate-500">Signed-in email:</span> <code className="break-all">{user?.email || "—"}</code></p>
            <p><span className="text-slate-500">Your Auth UID:</span> <code className="break-all">{user?.uid || "—"}</code></p>
            <p className="text-slate-600 mt-2">In Firebase Console → Firestore, open document <code>platform/settings</code> and set either:</p>
            <ul className="list-disc list-inside text-slate-600">
              <li><code>adminUids</code>: array containing your UID above</li>
              <li><code>adminEmails</code>: array containing your email (lowercase ok)</li>
            </ul>
            <p className="text-slate-500 mt-1">Then redeploy functions if you changed backend code, refresh this page, and try again.</p>
          </div>
          <Link to="/app" className="text-sm font-medium text-brand-blue hover:underline">
            Back to school app
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="bg-white border-b sticky top-0 z-20">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div
              className="w-8 h-8 rounded-lg flex items-center justify-center text-white font-bold text-sm"
              style={{ backgroundColor: BRAND.orange }}
            >
              CD
            </div>
            <div>
              <p className="font-semibold text-sm text-slate-900">Platform Admin</p>
              <p className="text-xs text-slate-500">Chosen Digital Solutions</p>
            </div>
          </div>
          <Link to="/app" className="text-sm text-slate-600 hover:text-brand-blue inline-flex items-center gap-1">
            <ArrowLeft className="w-4 h-4" /> School app
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-6 space-y-6">
        {/* Tabs */}
        <div className="flex gap-2 border-b">
          {(
            [
              { id: "schools" as const, label: "Schools", icon: Building2 },
              { id: "payments" as const, label: "Payments", icon: CreditCard },
              { id: "settings" as const, label: "Settings", icon: Settings },
              { id: "audit" as const, label: "Audit log", icon: ScrollText },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              onClick={() => setTab(t.id)}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px ${
                tab === t.id
                  ? "border-brand-blue text-brand-blue"
                  : "border-transparent text-slate-600 hover:text-slate-900"
              }`}
            >
              <t.icon className="w-4 h-4" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Stats */}
        {tab === "schools" && stats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {(
              [
                ["Total", stats.total],
                ["Active", stats.active],
                ["Suspended", stats.suspended],
                ["Trial", stats.trial],
                ["Monthly", stats.monthly],
                ["Lifetime", stats.lifetime],
                ["Paid", stats.paid],
              ] as const
            ).map(([label, val]) => (
              <div key={label} className="bg-white rounded-xl border p-3 text-center">
                <p className="text-xs text-slate-500">{label}</p>
                <p className="text-xl font-bold text-slate-900">{val}</p>
              </div>
            ))}
          </div>
        )}

        {/* Schools tab */}
        {tab === "schools" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-3">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadSchools()}
                  placeholder="Search name, email, county…"
                  className="w-full pl-9 pr-3 py-2 rounded-lg border border-slate-300 text-sm"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </select>
              <button
                onClick={loadSchools}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: BRAND.blue }}
              >
                Search
              </button>
            </div>

            {loading ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-8 h-8 animate-spin text-brand-blue" />
              </div>
            ) : schools.length === 0 ? (
              <div className="rounded-xl border border-dashed bg-white p-10 text-center text-sm text-slate-500">
                No schools found
              </div>
            ) : (
              <div className="bg-white rounded-xl border overflow-x-auto">
                <table className="w-full text-sm min-w-[800px]">
                  <thead className="bg-slate-50 text-left">
                    <tr>
                      <th className="px-4 py-3 font-medium">School</th>
                      <th className="px-4 py-3 font-medium">Email</th>
                      <th className="px-4 py-3 font-medium">Plan</th>
                      <th className="px-4 py-3 font-medium">Payment</th>
                      <th className="px-4 py-3 font-medium">Status</th>
                      <th className="px-4 py-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {schools.map((s) => (
                      <tr key={s.id} className="border-t">
                        <td className="px-4 py-3">
                          <p className="font-medium">{s.name || "—"}</p>
                          <p className="text-xs text-slate-400">{s.id.slice(0, 12)}…</p>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{s.contactEmail || "—"}</td>
                        <td className="px-4 py-3 capitalize">{s.plan || "—"}</td>
                        <td className="px-4 py-3 capitalize">{s.paymentStatus || "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${
                              s.accountStatus === "suspended"
                                ? "bg-red-50 text-red-700"
                                : "bg-green-50 text-green-700"
                            }`}
                          >
                            {s.accountStatus || "—"}
                          </span>
                          {s.suspensionReason && (
                            <p className="text-xs text-red-600 mt-1 max-w-[140px]">{s.suspensionReason}</p>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {s.accountStatus === "suspended" ? (
                            <button
                              disabled={acting === s.id}
                              onClick={() => handleActivate(s.id)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:bg-green-50 px-2 py-1 rounded"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Activate
                            </button>
                          ) : (
                            <button
                              disabled={acting === s.id}
                              onClick={() => handleSuspend(s.id, s.name)}
                              className="inline-flex items-center gap-1 text-xs font-medium text-red-700 hover:bg-red-50 px-2 py-1 rounded"
                            >
                              <Ban className="w-3.5 h-3.5" /> Suspend
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setGrantSchool(s)}
                            className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:bg-emerald-50 px-2 py-1 rounded"
                          >
                            Grant plan
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}


        {/* Payments tab */}
        {tab === "payments" && (
          <div className="space-y-4">
            {paymentStats && (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {[
                  ["Total records", paymentStats.total],
                  ["Paid", paymentStats.paid],
                  ["Pending", paymentStats.pending],
                  ["Failed", paymentStats.failed],
                  ["Revenue (KES)", paymentStats.revenueKes.toLocaleString()],
                ].map(([label, val]) => (
                  <div key={String(label)} className="bg-white rounded-xl border p-4">
                    <div className="text-xs text-slate-500">{label}</div>
                    <div className="text-xl font-bold text-slate-900 mt-1">{val}</div>
                  </div>
                ))}
              </div>
            )}
            <div className="flex flex-wrap gap-2 items-center">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  value={paymentSearch}
                  onChange={(e) => setPaymentSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadPayments()}
                  placeholder="Search school, email, reference…"
                  className="w-full rounded-lg border border-slate-300 pl-9 pr-3 py-2 text-sm"
                />
              </div>
              <select
                value={paymentStatus}
                onChange={(e) => setPaymentStatus(e.target.value)}
                className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
              >
                <option value="">All statuses</option>
                <option value="paid">Paid</option>
                <option value="pending">Pending</option>
                <option value="failed">Failed</option>
              </select>
              <button
                type="button"
                onClick={loadPayments}
                className="px-4 py-2 rounded-lg text-white text-sm font-medium"
                style={{ backgroundColor: BRAND.blue }}
              >
                Refresh
              </button>
            </div>
            <div className="bg-white rounded-xl border overflow-x-auto">
              {paymentsLoading ? (
                <div className="p-10 flex justify-center">
                  <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
                </div>
              ) : paymentRows.length === 0 ? (
                <div className="p-10 text-center text-sm text-slate-500">
                  No payment records yet. When schools pay via Paystack, they appear here with the school name.
                </div>
              ) : (
                <table className="w-full text-sm min-w-[900px]">
                  <thead>
                    <tr className="border-b bg-slate-50 text-left text-xs text-slate-500">
                      <th className="px-4 py-3">Date</th>
                      <th className="px-4 py-3">School</th>
                      <th className="px-4 py-3">Email / Phone</th>
                      <th className="px-4 py-3">Plan</th>
                      <th className="px-4 py-3">Amount (KES)</th>
                      <th className="px-4 py-3">Status</th>
                      <th className="px-4 py-3">Reference</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentRows.map((p) => (
                      <tr key={`${p.schoolId}-${p.id}`} className="border-b last:border-0">
                        <td className="px-4 py-3 text-slate-600 whitespace-nowrap">
                          {p.createdAt
                            ? String(p.createdAt).slice(0, 19).replace("T", " ")
                            : "—"}
                        </td>
                        <td className="px-4 py-3 font-medium">{p.schoolName || p.schoolId}</td>
                        <td className="px-4 py-3 text-slate-600">
                          <div>{p.contactEmail || p.email || "—"}</div>
                          {p.phone ? (
                            <div className="text-xs text-slate-400">{p.phone}</div>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 capitalize">{p.plan || "—"}</td>
                        <td className="px-4 py-3 font-medium">
                          {typeof p.amount === "number"
                            ? (p.amount / 100).toLocaleString()
                            : "—"}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-block px-2 py-0.5 rounded text-xs font-medium capitalize ${
                              p.status === "paid"
                                ? "bg-green-50 text-green-700"
                                : p.status === "failed"
                                  ? "bg-red-50 text-red-600"
                                  : "bg-amber-50 text-amber-700"
                            }`}
                          >
                            {p.status || "—"}
                          </span>
                        </td>
                        <td className="px-4 py-3 font-mono text-xs text-slate-500 max-w-[140px] truncate" title={p.reference}>
                          {p.reference || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        {/* Settings tab */}
        {tab === "settings" && (
          <form onSubmit={handleSaveSettings} className="bg-white rounded-xl border p-6 max-w-xl space-y-4">
            <h2 className="font-semibold text-lg">Integration keys</h2>
            <p className="text-xs text-slate-500">
              Secrets are stored server-side and returned masked only. Leave secret fields blank to keep existing values.
            </p>
            <div>
              <label className="block text-sm font-medium mb-1">Paystack public key</label>
              <input
                value={publicKey}
                onChange={(e) => setPublicKey(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                placeholder="pk_live_… or pk_test_…"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Platform admin emails (comma-separated) {secretMasked && <span className="text-slate-400 font-normal">(current: {secretMasked})</span>}
              </label>
              <input
                type="password"
                value={secretKey}
                onChange={(e) => setSecretKey(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                placeholder="Leave blank to keep · paste new to rotate"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">
                Webhook secret {webhookMasked && <span className="text-slate-400 font-normal">(current: {webhookMasked})</span>}
              </label>
              <input
                type="password"
                value={webhookSecret}
                onChange={(e) => setWebhookSecret(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm font-mono"
                placeholder="Leave blank to keep · paste new to rotate"
                autoComplete="off"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">App URL (callback)</label>
              <input
                value={appUrl}
                onChange={(e) => setAppUrl(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                placeholder="https://your-app.vercel.app"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Termly price (KES)</label>
                <input
                  type="number"
                  min={1}
                  value={termlyPrice}
                  onChange={(e) => setTermlyPrice(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Lifetime price (KES)</label>
                <input
                  type="number"
                  min={1}
                  value={lifetimePrice}
                  onChange={(e) => setLifetimePrice(Number(e.target.value))}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Yearly price (KES)</label>
                <input
                  type="number"
                  className="w-full border rounded-lg px-3 py-2"
                  value={yearlyPrice}
                  onChange={(e) => setYearlyPrice(Number(e.target.value))}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <p className="text-xs text-slate-500">These prices appear on each school&apos;s Billing page and are charged via Paystack.</p>
            <button
              type="submit"
              disabled={savingSettings}
              className="px-4 py-2 rounded-lg text-white text-sm font-medium disabled:opacity-60"
              style={{ backgroundColor: BRAND.blue }}
            >
              {savingSettings ? "Saving…" : "Save settings"}
            </button>
          </form>
        )}

        {/* Audit tab */}
        {tab === "audit" && (
          <div className="bg-white rounded-xl border overflow-x-auto">
            {auditEntries.length === 0 ? (
              <div className="p-10 text-center text-sm text-slate-500">No audit entries yet</div>
            ) : (
              <table className="w-full text-sm min-w-[640px]">
                <thead className="bg-slate-50 text-left">
                  <tr>
                    <th className="px-4 py-3 font-medium">Time</th>
                    <th className="px-4 py-3 font-medium">Action</th>
                    <th className="px-4 py-3 font-medium">Actor</th>
                    <th className="px-4 py-3 font-medium">Details</th>
                  </tr>
                </thead>
                <tbody>
                  {auditEntries.map((e) => (
                    <tr key={e.id} className="border-t">
                      <td className="px-4 py-3 text-xs text-slate-500 whitespace-nowrap">
                        {e.createdAt ? new Date(e.createdAt).toLocaleString() : "—"}
                      </td>
                      <td className="px-4 py-3 font-medium">{e.action}</td>
                      <td className="px-4 py-3 text-xs font-mono text-slate-500">{e.actorId?.slice(0, 12)}…</td>
                      <td className="px-4 py-3 text-xs text-slate-600 max-w-xs truncate">
                        {e.details ? JSON.stringify(e.details) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>

      {grantSchool && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-5 shadow-xl space-y-3">
            <h3 className="text-lg font-bold">Grant subscription</h3>
            <p className="text-sm text-slate-600">{grantSchool.name} · {grantSchool.contactEmail}</p>
            <div>
              <label className="text-xs font-medium">Plan</label>
              <select className="w-full border rounded-lg px-3 py-2 text-sm" value={grantPlan} onChange={(e) => setGrantPlan(e.target.value)}>
                <option value="trial">Trial</option>
                <option value="termly">Termly</option>
                <option value="yearly">Yearly</option>
                <option value="monthly">Monthly</option>
                <option value="lifetime">Lifetime</option>
              </select>
            </div>
            <div>
              <label className="text-xs font-medium">Expiry date (optional)</label>
              <input type="date" className="w-full border rounded-lg px-3 py-2 text-sm" value={grantExpiry} onChange={(e) => setGrantExpiry(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Payment reference (e.g. M-Pesa)</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={grantRef} onChange={(e) => setGrantRef(e.target.value)} />
            </div>
            <div>
              <label className="text-xs font-medium">Note</label>
              <input className="w-full border rounded-lg px-3 py-2 text-sm" value={grantNote} onChange={(e) => setGrantNote(e.target.value)} />
            </div>
            <div className="flex gap-2 justify-end">
              <button type="button" className="px-3 py-2 border rounded-lg text-sm" onClick={() => setGrantSchool(null)}>Cancel</button>
              <button type="button" disabled={granting} className="px-3 py-2 rounded-lg text-sm text-white bg-slate-900" onClick={submitGrant}>
                {granting ? "Saving…" : "Save subscription"}
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
