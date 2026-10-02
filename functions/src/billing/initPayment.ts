/**
 * Callable: initialize Paystack transaction for monthly or lifetime plan.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { PLAN_LABELS, getAppUrl, getPlanAmountKobo, type PlanId } from "./config";
import { paystackRequest, type InitializeResponse } from "./paystackClient";

interface InitInput {
  schoolId: string;
  plan: PlanId;
  email?: string;
}

export const initPayment = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const { schoolId, plan, email } = (request.data || {}) as InitInput;
  if (!schoolId || !plan || !["monthly", "termly", "yearly", "lifetime"].includes(plan)) {
    throw new HttpsError("invalid-argument", "schoolId and plan (termly|yearly|lifetime|monthly) are required");
  }

  const db = admin.firestore();
  const uid = request.auth.uid;

  const memberSnap = await db.doc(`schools/${schoolId}/users/${uid}`).get();
  if (!memberSnap.exists || memberSnap.data()?.active !== true) {
    throw new HttpsError("permission-denied", "Not a member of this school");
  }
  const role = memberSnap.data()?.role;
  if (!["principal", "timetable_admin"].includes(role)) {
    throw new HttpsError("permission-denied", "Only principal or timetable admin can manage billing");
  }

  const schoolSnap = await db.doc(`schools/${schoolId}`).get();
  if (!schoolSnap.exists) {
    throw new HttpsError("not-found", "School not found");
  }
  const school = schoolSnap.data()!;
  if (school.accountStatus === "suspended") {
    throw new HttpsError("failed-precondition", "School is suspended");
  }

  const amount = await getPlanAmountKobo(plan as PlanId);
  const customerEmail =
    email ||
    memberSnap.data()?.email ||
    school.contactEmail ||
    request.auth.token.email ||
    "";

  if (!customerEmail) {
    throw new HttpsError("invalid-argument", "Customer email is required");
  }

  const paymentRef = db.collection(`schools/${schoolId}/payments`).doc();
  const reference = `ctt_${schoolId.slice(0, 8)}_${paymentRef.id.slice(0, 10)}_${Date.now()}`;

  await paymentRef.set({
    schoolId,
    plan,
    amount,
    currency: "KES",
    status: "pending",
    reference,
    initiatedBy: uid,
    email: customerEmail,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.doc(`schools/${schoolId}`).update({
    paymentStatus: "pending",
    updatedAt: new Date().toISOString(),
  });

  const callbackUrl = `${getAppUrl()}/app/billing?reference=${encodeURIComponent(reference)}&schoolId=${encodeURIComponent(schoolId)}`;

  const init = await paystackRequest<InitializeResponse>("POST", "/transaction/initialize", {
    email: customerEmail,
    amount,
    currency: "KES",
    reference,
    callback_url: callbackUrl,
    metadata: {
      schoolId,
      plan,
      paymentId: paymentRef.id,
      uid,
      custom_fields: [
        { display_name: "School", variable_name: "school_id", value: schoolId },
        { display_name: "Plan", variable_name: "plan", value: plan },
      ],
    },
  });

  await paymentRef.update({
    accessCode: init.access_code,
    authorizationUrl: init.authorization_url,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
  });

  await db.collection(`schools/${schoolId}/auditLogs`).add({
    schoolId,
    actorId: uid,
    action: "payment.initiated",
    entityType: "payment",
    entityId: paymentRef.id,
    details: { plan, reference, amount },
    createdAt: new Date().toISOString(),
  });

  return {
    authorizationUrl: init.authorization_url,
    reference: init.reference,
    paymentId: paymentRef.id,
    amount,
    plan,
    label: PLAN_LABELS[plan],
  };
});