/**
 * Chosen Time Tables — Cloud Functions
 */

import * as admin from "firebase-admin";
import { onRequest } from "firebase-functions/v2/https";

if (!admin.apps.length) {
  admin.initializeApp();
}

export { initPayment } from "./billing/initPayment";
export { verifyPayment } from "./billing/verifyPayment";
export { paystackWebhook } from "./billing/webhook";

export {
  listSchools,
  grantManualSubscription,
  getSchoolAdmin,
  suspendSchool,
  activateSchool,
  listPlatformPayments,
} from "./platform/schools";
export {
  getPlatformSettings,
  updatePlatformSettings,
  getPublicPlans,
  listPlatformAudit,
} from "./platform/settings";
export { requestClassPdfDownload, resetTrialPdfAllowance } from "./billing/trialPdf";

export const health = onRequest((_req, res) => {
  res.json({ ok: true, service: "chosen-time-tables-functions" });
});