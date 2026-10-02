/**
 * Paystack config — secrets from environment only.
 * NEVER expose secret key to the client.
 */

import * as admin from "firebase-admin";

export function getPaystackSecretKey(): string {
  return process.env.PAYSTACK_SECRET_KEY || process.env.PAYSTACK_SECRET || "";
}

export function getPaystackPublicKey(): string {
  return process.env.PAYSTACK_PUBLIC_KEY || "";
}

export function getPaystackWebhookSecret(): string {
  return (
    process.env.PAYSTACK_WEBHOOK_SECRET ||
    process.env.PAYSTACK_SECRET_KEY ||
    ""
  );
}

export function getAppUrl(): string {
  return process.env.APP_URL || process.env.FRONTEND_URL || "http://localhost:3000";
}

export type PlanId = "monthly" | "termly" | "yearly" | "lifetime";

/** Fallback plan amounts in kobo (KES × 100) */
const DEFAULT_AMOUNTS: Record<PlanId, number> = {
  monthly: 500 * 100,
  termly: 500 * 100,
  yearly: 1400 * 100,
  lifetime: 5000 * 100,
};

export const PLAN_LABELS: Record<PlanId, string> = {
  monthly: "Chosen Time Tables — Monthly",
  termly: "Chosen Time Tables — Termly",
  yearly: "Chosen Time Tables — Yearly",
  lifetime: "Chosen Time Tables — Lifetime",
};

/** Load plan amounts from platform/settings (editable by platform owner) */
export async function getPlanAmountsKes(): Promise<Record<PlanId, number>> {
  try {
    const snap = await admin.firestore().doc("platform/settings").get();
    const d = snap.data() || {};
    const termly = Number(d.termlyPriceKes) > 0 ? Number(d.termlyPriceKes) : Number(d.monthlyPriceKes) > 0 ? Number(d.monthlyPriceKes) : 500;
    const yearly = Number(d.yearlyPriceKes) > 0 ? Number(d.yearlyPriceKes) : 1400;
    const lifetime = Number(d.lifetimePriceKes) > 0 ? Number(d.lifetimePriceKes) : 5000;
    const monthly = Number(d.monthlyPriceKes) > 0 ? Number(d.monthlyPriceKes) : termly;
    return {
      monthly,
      termly,
      yearly,
      lifetime,
    };
  } catch {
    return {
      monthly: 500,
      termly: 500,
      yearly: 1400,
      lifetime: 5000,
    };
  }
}

export async function getPlanAmountKobo(plan: PlanId): Promise<number> {
  const kes = await getPlanAmountsKes();
  return (kes[plan] || DEFAULT_AMOUNTS[plan] / 100) * 100;
}

/** @deprecated use getPlanAmountKobo */
export const PLAN_AMOUNTS = DEFAULT_AMOUNTS;

export function getPlanAmounts() {
  return DEFAULT_AMOUNTS;
}

export const PAYSTACK_BASE = "https://api.paystack.co";

export const PAYSTACK_SECRET_KEY = { value: () => getPaystackSecretKey() };
export const PAYSTACK_WEBHOOK_SECRET = { value: () => getPaystackWebhookSecret() };
export const APP_URL = { value: () => getAppUrl() };
