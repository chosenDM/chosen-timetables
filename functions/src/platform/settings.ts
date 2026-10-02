/**
 * Platform settings — store integration keys securely.
 * Secrets are NEVER returned in full to the client after save (masked).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertPlatformAdmin, writePlatformAudit } from "./assertAdmin";

function mask(value: string | undefined | null): string | null {
  if (!value) return null;
  if (value.length <= 8) return "••••••••";
  return value.slice(0, 4) + "••••" + value.slice(-4);
}

export const getPlatformSettings = onCall({ cors: true }, async (request) => {
  await assertPlatformAdmin(request.auth?.uid);

  const snap = await admin.firestore().doc("platform/settings").get();
  const data = snap.data() || {};

  // Return masked secrets only
  return {
    adminUids: data.adminUids || [],
    adminEmails: data.adminEmails || [],
    paystackPublicKey: data.paystackPublicKey || null,
    paystackSecretKeyMasked: mask(data.paystackSecretKey),
    paystackWebhookSecretMasked: mask(data.paystackWebhookSecret),
    hasPaystackSecret: !!data.paystackSecretKey,
    hasWebhookSecret: !!data.paystackWebhookSecret,
    appUrl: data.appUrl || null,
    monthlyPriceKes: data.monthlyPriceKes ?? 500,
    termlyPriceKes: data.termlyPriceKes ?? 500,
    yearlyPriceKes: data.yearlyPriceKes ?? 1400,
    lifetimePriceKes: data.lifetimePriceKes ?? 5000,
    lifetimePriceKes: data.lifetimePriceKes ?? 5000,
    updatedAt: data.updatedAt || null,
  };
});

export const updatePlatformSettings = onCall({ cors: true }, async (request) => {
  await assertPlatformAdmin(request.auth?.uid);
  const uid = request.auth!.uid;

  const input = (request.data || {}) as {
    paystackPublicKey?: string;
    paystackSecretKey?: string;
    paystackWebhookSecret?: string;
    appUrl?: string;
    adminUids?: string[];
  adminEmails?: string[];
    monthlyPriceKes?: number;
    lifetimePriceKes?: number;
    termlyPriceKes?: number;
    yearlyPriceKes?: number;
  };

  const db = admin.firestore();
  const ref = db.doc("platform/settings");
  const existing = (await ref.get()).data() || {};

  const update: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
    updatedBy: uid,
  };

  if (input.paystackPublicKey !== undefined) {
    update.paystackPublicKey = input.paystackPublicKey.trim();
  }
  // Only overwrite secret if a non-empty new value is provided (rotation)
  if (input.paystackSecretKey && input.paystackSecretKey.trim()) {
    update.paystackSecretKey = input.paystackSecretKey.trim();
  }
  if (input.paystackWebhookSecret && input.paystackWebhookSecret.trim()) {
    update.paystackWebhookSecret = input.paystackWebhookSecret.trim();
  }
  if (input.appUrl !== undefined) {
    update.appUrl = input.appUrl.trim();
  }
  if (Array.isArray(input.adminUids)) {
    update.adminUids = input.adminUids.map((u) => u.trim()).filter(Boolean);
  }
  if (Array.isArray(input.adminEmails)) {
    update.adminEmails = input.adminEmails.map((u) => u.trim().toLowerCase()).filter(Boolean);
  }
  if (input.monthlyPriceKes !== undefined && Number(input.monthlyPriceKes) > 0) {
    update.monthlyPriceKes = Number(input.monthlyPriceKes);
  }
  if (input.termlyPriceKes !== undefined && Number(input.termlyPriceKes) > 0) {
    update.termlyPriceKes = Number(input.termlyPriceKes);
  }
  if (input.yearlyPriceKes !== undefined && Number(input.yearlyPriceKes) > 0) {
    update.yearlyPriceKes = Number(input.yearlyPriceKes);
  }
  if (input.lifetimePriceKes !== undefined && Number(input.lifetimePriceKes) > 0) {
    update.lifetimePriceKes = Number(input.lifetimePriceKes);
  }

  await ref.set({ ...existing, ...update }, { merge: true });

  await writePlatformAudit(uid, "platform.settings.updated", {
    fields: Object.keys(update).filter((k) => k !== "updatedAt" && k !== "updatedBy"),
    // Never log secret values
    secretRotated: !!(input.paystackSecretKey && input.paystackSecretKey.trim()),
  });

  // Return masked view
  const after = (await ref.get()).data() || {};
  return {
    success: true,
    paystackPublicKey: after.paystackPublicKey || null,
    paystackSecretKeyMasked: mask(after.paystackSecretKey as string),
    paystackWebhookSecretMasked: mask(after.paystackWebhookSecret as string),
    hasPaystackSecret: !!after.paystackSecretKey,
    hasWebhookSecret: !!after.paystackWebhookSecret,
    appUrl: after.appUrl || null,
    adminUids: after.adminUids || [],
    monthlyPriceKes: after.monthlyPriceKes ?? 200,
    lifetimePriceKes: after.lifetimePriceKes ?? 3000,
  };
});

export const listPlatformAudit = onCall({ cors: true }, async (request) => {
  await assertPlatformAdmin(request.auth?.uid);

  const { limit: lim } = (request.data || {}) as { limit?: number };
  const snap = await admin
    .firestore()
    .collection("platform")
    .doc("auditLogs")
    .collection("entries")
    .orderBy("createdAt", "desc")
    .limit(Math.min(lim || 50, 100))
    .get();

  return {
    entries: snap.docs.map((d) => ({ id: d.id, ...d.data() })),
  };
});


/** Public plan prices for school billing UI (no secrets) */
export const getPublicPlans = onCall({ cors: true }, async () => {
  const snap = await admin.firestore().doc("platform/settings").get();
  const data = snap.data() || {};
  return {
    monthlyPriceKes: Number(data.monthlyPriceKes) > 0 ? Number(data.monthlyPriceKes) : 500,
    termlyPriceKes: Number(data.termlyPriceKes) > 0 ? Number(data.termlyPriceKes) : 500,
    yearlyPriceKes: Number(data.yearlyPriceKes) > 0 ? Number(data.yearlyPriceKes) : 1400,
    lifetimePriceKes: Number(data.lifetimePriceKes) > 0 ? Number(data.lifetimePriceKes) : 5000,
  };
});
