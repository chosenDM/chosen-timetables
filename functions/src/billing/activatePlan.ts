/**
 * Shared plan activation — used by verifyPayment and webhook.
 * Idempotent: safe to call multiple times for the same reference.
 */

import * as admin from "firebase-admin";
import type { VerifyResponse } from "./paystackClient";

export async function activatePlanFromVerification(
  schoolId: string,
  reference: string,
  verifyData: VerifyResponse,
  source: "verify" | "webhook"
): Promise<{ alreadyProcessed: boolean; plan: string }> {
  const db = admin.firestore();

  // Find payment by reference
  const paymentsSnap = await db
    .collection(`schools/${schoolId}/payments`)
    .where("reference", "==", reference)
    .limit(1)
    .get();

  if (paymentsSnap.empty) {
    // Fallback: metadata may carry schoolId
    throw new Error(`Payment not found for reference ${reference}`);
  }

  const paymentDoc = paymentsSnap.docs[0];
  const payment = paymentDoc.data();

  // Duplicate protection
  if (payment.status === "paid") {
    return { alreadyProcessed: true, plan: payment.plan };
  }

  if (verifyData.status !== "success") {
    await paymentDoc.ref.update({
      status: "failed",
      paystackStatus: verifyData.status,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      lastSource: source,
    });
    await db.doc(`schools/${schoolId}`).update({
      paymentStatus: "failed",
      updatedAt: new Date().toISOString(),
    });
    throw new Error(`Payment not successful: ${verifyData.status}`);
  }

  // Amount check (kobo)
  if (verifyData.amount !== payment.amount) {
    await paymentDoc.ref.update({
      status: "failed",
      failReason: "amount_mismatch",
      paystackAmount: verifyData.amount,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    throw new Error("Amount mismatch");
  }

  const plan = String(payment.plan || "monthly").toLowerCase();
  const now = new Date().toISOString();

  // Activate
  const schoolUpdate: Record<string, unknown> = {
    plan,
    paymentStatus: "paid",
    accountStatus: "active",
    updatedAt: now,
    subscriptionStartsAt: now,
  };
  if (plan === "monthly") {
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    schoolUpdate.subscriptionRenewsAt = next.toISOString();
    schoolUpdate.subscriptionExpiresAt = next.toISOString();
  } else if (plan === "termly") {
    const next = new Date();
    next.setMonth(next.getMonth() + 4);
    schoolUpdate.subscriptionRenewsAt = next.toISOString();
    schoolUpdate.subscriptionExpiresAt = next.toISOString();
  } else if (plan === "yearly") {
    const next = new Date();
    next.setFullYear(next.getFullYear() + 1);
    schoolUpdate.subscriptionRenewsAt = next.toISOString();
    schoolUpdate.subscriptionExpiresAt = next.toISOString();
  } else if (plan === "lifetime") {
    schoolUpdate.lifetimePurchasedAt = now;
    schoolUpdate.subscriptionExpiresAt = null;
  } else {
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    schoolUpdate.subscriptionRenewsAt = next.toISOString();
    schoolUpdate.subscriptionExpiresAt = next.toISOString();
  }

  await paymentDoc.ref.update({
    status: "paid",
    paystackStatus: verifyData.status,
    paidAt: verifyData.paid_at || now,
    channel: verifyData.channel,
    paystackId: verifyData.id,
    activatedVia: source,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.doc(`schools/${schoolId}`).update(schoolUpdate);

  await db.collection(`schools/${schoolId}/auditLogs`).add({
    schoolId,
    actorId: payment.initiatedBy || "system",
    action: "payment.activated",
    entityType: "payment",
    entityId: paymentDoc.id,
    details: { plan, reference, source, amount: payment.amount },
    createdAt: now,
  });

  return { alreadyProcessed: false, plan };
}
