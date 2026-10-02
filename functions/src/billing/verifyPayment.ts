/**
 * Callable: verify a Paystack transaction by reference after redirect.
 * Does not trust the client "payment successful" claim — always verifies with Paystack.
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { paystackRequest, type VerifyResponse } from "./paystackClient";
import { activatePlanFromVerification } from "./activatePlan";

interface VerifyInput {
  schoolId: string;
  reference: string;
}

export const verifyPayment = onCall({ cors: true }, async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const { schoolId, reference } = (request.data || {}) as VerifyInput;
  if (!schoolId || !reference) {
    throw new HttpsError("invalid-argument", "schoolId and reference are required");
  }

  const db = admin.firestore();
  const uid = request.auth.uid;

  const memberSnap = await db.doc(`schools/${schoolId}/users/${uid}`).get();
  if (!memberSnap.exists || memberSnap.data()?.active !== true) {
    throw new HttpsError("permission-denied", "Not a member of this school");
  }

  let verifyData: VerifyResponse;
  try {
    verifyData = await paystackRequest<VerifyResponse>(
      "GET",
      `/transaction/verify/${encodeURIComponent(reference)}`
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Verification failed";
    throw new HttpsError("internal", msg);
  }

  // Ensure metadata school matches
  const metaSchoolId = (verifyData.metadata as { schoolId?: string } | undefined)?.schoolId;
  if (metaSchoolId && metaSchoolId !== schoolId) {
    throw new HttpsError("permission-denied", "Reference does not belong to this school");
  }

  try {
    const result = await activatePlanFromVerification(schoolId, reference, verifyData, "verify");
    return {
      success: true,
      alreadyProcessed: result.alreadyProcessed,
      plan: result.plan,
      status: verifyData.status,
      reference,
    };
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : "Activation failed";
    throw new HttpsError("failed-precondition", msg);
  }
});
