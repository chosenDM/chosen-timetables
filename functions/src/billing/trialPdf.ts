/**
 * Controlled free-trial class PDF downloads.
 * Trial schools may download ONE class timetable PDF.
 * Paid / lifetime plans: unlimited (subject to account active).
 */

import { onCall, HttpsError } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import { assertPlatformAdmin } from "../platform/assertAdmin";

function isPaidPlan(plan: string | undefined, paymentStatus: string | undefined): boolean {
  const p = (plan || "").toLowerCase();
  const s = (paymentStatus || "").toLowerCase();
  if (p === "lifetime" || p === "monthly" || p === "termly" || p === "yearly") {
    return s === "active" || s === "paid" || p === "lifetime";
  }
  return false;
}

/**
 * Call before delivering a class-mode PDF.
 * data: { schoolId, classId, className? }
 */
export const requestClassPdfDownload = onCall(async (request) => {
  if (!request.auth?.uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }
  const schoolId = String(request.data?.schoolId || "").trim();
  const classId = String(request.data?.classId || "").trim();
  const className = String(request.data?.className || classId).trim();
  if (!schoolId || !classId) {
    throw new HttpsError("invalid-argument", "schoolId and classId required");
  }

  const db = admin.firestore();
  const schoolRef = db.doc(`schools/${schoolId}`);
  const schoolSnap = await schoolRef.get();
  if (!schoolSnap.exists) {
    throw new HttpsError("not-found", "School not found");
  }
  const school = schoolSnap.data() || {};

  // Member check
  const memberSnap = await db.doc(`schools/${schoolId}/members/${request.auth.uid}`).get();
  if (!memberSnap.exists) {
    // also try schoolUsers pattern
    const alt = await db
      .collection("schools")
      .doc(schoolId)
      .collection("users")
      .doc(request.auth.uid)
      .get();
    if (!alt.exists) {
      throw new HttpsError("permission-denied", "Not a member of this school");
    }
  }

  if (school.accountStatus === "suspended") {
    throw new HttpsError("failed-precondition", "School account is suspended");
  }

  const paid = isPaidPlan(school.plan, school.paymentStatus);
  if (paid) {
    return {
      allowed: true,
      reason: "paid",
      remainingFree: null,
    };
  }

  // Trial / unpaid: one free class PDF total
  const used: string[] = Array.isArray(school.trialPdfClassIds) ? school.trialPdfClassIds : [];
  const count = Number(school.trialPdfDownloadCount || used.length || 0);

  if (used.includes(classId) || count >= 1) {
    // Allow re-download of the same class they already unlocked
    if (used.includes(classId)) {
      return {
        allowed: true,
        reason: "already_unlocked",
        remainingFree: 0,
        unlockedClassId: classId,
      };
    }
    return {
      allowed: false,
      reason: "trial_limit",
      message:
        "You have used your free timetable download. Upgrade to download timetables for all classes.",
      remainingFree: 0,
    };
  }

  // Record first free download
  await schoolRef.set(
    {
      trialPdfDownloadCount: 1,
      trialPdfClassIds: admin.firestore.FieldValue.arrayUnion(classId),
      trialPdfLastClassId: classId,
      trialPdfLastClassName: className,
      trialPdfLastAt: new Date().toISOString(),
    },
    { merge: true }
  );

  await db.collection("schools").doc(schoolId).collection("auditLogs").add({
    action: "trial_class_pdf_download",
    classId,
    className,
    actorId: request.auth.uid,
    createdAt: new Date().toISOString(),
  });

  return {
    allowed: true,
    reason: "trial_first",
    remainingFree: 0,
    unlockedClassId: classId,
  };
});

/** Platform admin: reset trial PDF allowance for a school */
export const resetTrialPdfAllowance = onCall(async (request) => {
  await assertPlatformAdmin(request.auth?.uid);
  const schoolId = String(request.data?.schoolId || "").trim();
  if (!schoolId) throw new HttpsError("invalid-argument", "schoolId required");
  await admin.firestore().doc(`schools/${schoolId}`).set(
    {
      trialPdfDownloadCount: 0,
      trialPdfClassIds: [],
      trialPdfLastClassId: null,
      trialPdfLastAt: null,
    },
    { merge: true }
  );
  return { ok: true };
});
