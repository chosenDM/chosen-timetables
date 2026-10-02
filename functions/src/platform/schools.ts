/**
 * Platform admin — list / search schools, suspend, activate, payments.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertPlatformAdmin, writePlatformAudit } from "./assertAdmin";

export const listSchools = onCall({ cors: true }, async (request) => {
  await assertPlatformAdmin(request.auth?.uid);

  const { search, status, plan, limit: lim } = (request.data || {}) as {
    search?: string;
    status?: string;
    plan?: string;
    limit?: number;
  };

  const db = admin.firestore();
  const q = db.collection("schools").orderBy("createdAt", "desc");

  const snap = await q.limit(Math.min(lim || 100, 200)).get();
  let schools = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  if (status) {
    schools = schools.filter((s: any) => s.accountStatus === status);
  }
  if (plan) {
    schools = schools.filter((s: any) => s.plan === plan);
  }
  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    schools = schools.filter(
      (s: any) =>
        (s.name || "").toLowerCase().includes(term) ||
        (s.slug || "").toLowerCase().includes(term) ||
        (s.contactEmail || "").toLowerCase().includes(term) ||
        (s.county || "").toLowerCase().includes(term) ||
        (s.phone || "").toLowerCase().includes(term) ||
        (s.id || "").toLowerCase().includes(term)
    );
  }

  const allSnap = await db.collection("schools").get();
  const all = allSnap.docs.map((d) => d.data());
  const stats = {
    total: all.length,
    active: all.filter((s) => s.accountStatus === "active").length,
    suspended: all.filter((s) => s.accountStatus === "suspended").length,
    trial: all.filter((s) => s.plan === "trial").length,
    monthly: all.filter((s) => s.plan === "monthly").length,
    lifetime: all.filter((s) => s.plan === "lifetime").length,
    paid: all.filter((s) => s.paymentStatus === "paid").length,
  };

  return { schools, stats };
});

export const getSchoolAdmin = onCall({ cors: true }, async (request) => {
  await assertPlatformAdmin(request.auth?.uid);
  const { schoolId } = (request.data || {}) as { schoolId?: string };
  if (!schoolId) throw new HttpsError("invalid-argument", "schoolId required");

  const db = admin.firestore();
  const schoolSnap = await db.doc(`schools/${schoolId}`).get();
  if (!schoolSnap.exists) throw new HttpsError("not-found", "School not found");

  const usersSnap = await db.collection(`schools/${schoolId}/users`).limit(50).get();
  const paymentsSnap = await db
    .collection(`schools/${schoolId}/payments`)
    .orderBy("createdAt", "desc")
    .limit(10)
    .get()
    .catch(() => ({ docs: [] as any[] }));

  return {
    school: { id: schoolSnap.id, ...schoolSnap.data() },
    users: usersSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
    payments: paymentsSnap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
});

export const suspendSchool = onCall({ cors: true }, async (request) => {
  await assertPlatformAdmin(request.auth?.uid);
  const uid = request.auth!.uid;
  const { schoolId, reason } = (request.data || {}) as {
    schoolId?: string;
    reason?: string;
  };
  if (!schoolId) throw new HttpsError("invalid-argument", "schoolId required");

  const db = admin.firestore();
  const ref = db.doc(`schools/${schoolId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "School not found");

  const now = new Date().toISOString();
  await ref.update({
    accountStatus: "suspended",
    suspensionReason: reason || "Suspended by platform admin",
    suspendedBy: uid,
    suspendedAt: now,
    updatedAt: now,
  });

  await writePlatformAudit(uid, "school.suspended", {
    schoolId,
    reason: reason || null,
    schoolName: snap.data()?.name,
  });

  await db.collection(`schools/${schoolId}/auditLogs`).add({
    schoolId,
    actorId: uid,
    action: "school.suspended",
    details: { reason },
    createdAt: now,
  });

  return { success: true, accountStatus: "suspended" };
});

export const activateSchool = onCall({ cors: true }, async (request) => {
  await assertPlatformAdmin(request.auth?.uid);
  const uid = request.auth!.uid;
  const { schoolId } = (request.data || {}) as { schoolId?: string };
  if (!schoolId) throw new HttpsError("invalid-argument", "schoolId required");

  const db = admin.firestore();
  const ref = db.doc(`schools/${schoolId}`);
  const snap = await ref.get();
  if (!snap.exists) throw new HttpsError("not-found", "School not found");

  const now = new Date().toISOString();
  await ref.update({
    accountStatus: "active",
    activatedBy: uid,
    activatedAt: now,
    suspensionReason: admin.firestore.FieldValue.delete(),
    updatedAt: now,
  });

  await writePlatformAudit(uid, "school.activated", {
    schoolId,
    schoolName: snap.data()?.name,
  });

  await db.collection(`schools/${schoolId}/auditLogs`).add({
    schoolId,
    actorId: uid,
    action: "school.activated",
    createdAt: now,
  });

  return { success: true, accountStatus: "active" };
});

/**
 * List payments across all schools for platform admin.
 */
export const listPlatformPayments = onCall({ cors: true }, async (request) => {
  await assertPlatformAdmin(request.auth?.uid);

  const { status, search, limit: lim } = (request.data || {}) as {
    status?: string;
    search?: string;
    limit?: number;
  };

  const db = admin.firestore();
  const schoolsSnap = await db.collection("schools").get();
  const schoolMap = new Map(
    schoolsSnap.docs.map((d) => [d.id, d.data() as Record<string, unknown>])
  );

  const max = Math.min(lim || 200, 500);
  const payments: Array<Record<string, unknown>> = [];

  for (const schoolDoc of schoolsSnap.docs) {
    const schoolId = schoolDoc.id;
    const school = schoolMap.get(schoolId) || {};
    try {
      const paySnap = await db
        .collection(`schools/${schoolId}/payments`)
        .orderBy("createdAt", "desc")
        .limit(50)
        .get();
      for (const p of paySnap.docs) {
        const data = p.data();
        payments.push({
          id: p.id,
          schoolId,
          schoolName: (school.name as string) || schoolId,
          contactEmail: (school.contactEmail as string) || "",
          phone: (school.phone as string) || "",
          plan: data.plan || "",
          amount: data.amount || 0,
          status: data.status || "pending",
          reference: data.reference || "",
          email: data.email || school.contactEmail || "",
          createdAt: data.createdAt || "",
          paidAt: data.paidAt || data.updatedAt || "",
        });
      }
    } catch {
      // skip schools without payments collection / index
    }
  }

  payments.sort((a, b) =>
    String(b.createdAt || "").localeCompare(String(a.createdAt || ""))
  );

  let filtered = payments;
  if (status) {
    filtered = filtered.filter((p) => p.status === status);
  }
  if (search && search.trim()) {
    const term = search.trim().toLowerCase();
    filtered = filtered.filter(
      (p) =>
        String(p.schoolName).toLowerCase().includes(term) ||
        String(p.contactEmail).toLowerCase().includes(term) ||
        String(p.reference).toLowerCase().includes(term) ||
        String(p.phone).toLowerCase().includes(term)
    );
  }

  const limited = filtered.slice(0, max);

  const paid = payments.filter((p) => p.status === "paid");
  const revenueKobo = paid.reduce((sum, p) => sum + Number(p.amount || 0), 0);

  return {
    payments: limited,
    stats: {
      total: payments.length,
      paid: paid.length,
      pending: payments.filter((p) => p.status === "pending").length,
      failed: payments.filter((p) => p.status === "failed").length,
      revenueKes: Math.round(revenueKobo / 100),
    },
  };
});

/**
 * Platform owner manually grants/extends a school subscription (e.g. M-Pesa).
 */
export const grantManualSubscription = onCall({ cors: true }, async (request) => {
  await assertPlatformAdmin(request.auth?.uid);
  const uid = request.auth!.uid;
  const {
    schoolId,
    plan,
    startDate,
    expiryDate,
    paymentReference,
    note,
  } = (request.data || {}) as {
    schoolId?: string;
    plan?: string;
    startDate?: string;
    expiryDate?: string;
    paymentReference?: string;
    note?: string;
  };

  if (!schoolId) throw new HttpsError("invalid-argument", "schoolId required");
  const planId = (plan || "").toLowerCase();
  if (!["trial", "monthly", "termly", "yearly", "lifetime"].includes(planId)) {
    throw new HttpsError("invalid-argument", "Invalid plan");
  }

  const db = admin.firestore();
  const schoolRef = db.doc(`schools/${schoolId}`);
  const schoolSnap = await schoolRef.get();
  if (!schoolSnap.exists) throw new HttpsError("not-found", "School not found");

  const now = new Date();
  const start = startDate ? new Date(startDate) : now;
  let expiry: Date | null = null;
  if (planId === "lifetime") {
    expiry = null;
  } else if (expiryDate) {
    expiry = new Date(expiryDate);
  } else if (planId === "monthly") {
    expiry = new Date(start);
    expiry.setMonth(expiry.getMonth() + 1);
  } else if (planId === "termly") {
    expiry = new Date(start);
    expiry.setMonth(expiry.getMonth() + 4); // ~one school term
  } else if (planId === "yearly") {
    expiry = new Date(start);
    expiry.setFullYear(expiry.getFullYear() + 1);
  } else if (planId === "trial") {
    expiry = new Date(start);
    expiry.setDate(expiry.getDate() + 14);
  }

  const schoolUpdate: Record<string, unknown> = {
    plan: planId,
    paymentStatus: planId === "trial" ? "trial" : "paid",
    accountStatus: "active",
    subscriptionStartsAt: start.toISOString(),
    subscriptionExpiresAt: expiry ? expiry.toISOString() : null,
    subscriptionRenewsAt: expiry ? expiry.toISOString() : null,
    updatedAt: now.toISOString(),
    lastManualGrantAt: now.toISOString(),
    lastManualGrantBy: uid,
  };
  if (planId === "lifetime") {
    schoolUpdate.lifetimePurchasedAt = now.toISOString();
    schoolUpdate.subscriptionExpiresAt = null;
  }

  await schoolRef.set(schoolUpdate, { merge: true });

  // Subscription history (append-only)
  await db.collection(`schools/${schoolId}/subscriptionHistory`).add({
    plan: planId,
    startDate: start.toISOString(),
    expiryDate: expiry ? expiry.toISOString() : null,
    paymentMethod: "manual",
    paymentReference: paymentReference || null,
    note: note || null,
    activatedBy: uid,
    previousPlan: schoolSnap.data()?.plan || null,
    previousPaymentStatus: schoolSnap.data()?.paymentStatus || null,
    createdAt: now.toISOString(),
  });

  // Platform payment log for dashboard
  await db.collection("platform").doc("payments").collection("entries").add({
    schoolId,
    schoolName: schoolSnap.data()?.name || null,
    plan: planId,
    amount: 0,
    currency: "KES",
    status: "manual",
    paymentReference: paymentReference || null,
    note: note || null,
    activatedBy: uid,
    createdAt: now.toISOString(),
  });

  await writePlatformAudit(uid, "grant_manual_subscription", {
    schoolId,
    plan: planId,
    paymentReference: paymentReference || null,
    note: note || null,
  });

  return {
    ok: true,
    schoolId,
    plan: planId,
    subscriptionExpiresAt: expiry ? expiry.toISOString() : null,
  };
});
