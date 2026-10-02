/**
 * Platform admin authorization.
 *
 * Supported sources (any match grants access):
 * 1. platform/settings.adminUids — Firebase Auth UIDs
 * 2. platform/settings.adminEmails — emails (case-insensitive)
 * 3. platform/settings.admins.uids — legacy nested path
 * 4. Env PLATFORM_ADMIN_UIDS / PLATFORM_ADMIN_EMAILS (comma-separated)
 *
 * Root cause of past "Access Denied": admins often added an *email* while
 * the code only checked *UID*. Both are now supported.
 */

import * as admin from "firebase-admin";
import { HttpsError } from "firebase-functions/v2/https";

function splitEnv(name: string): string[] {
  return (process.env[name] || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function assertPlatformAdmin(uid: string | undefined): Promise<void> {
  if (!uid) {
    throw new HttpsError("unauthenticated", "Sign in required");
  }

  const snap = await admin.firestore().doc("platform/settings").get();
  const data = snap.data() || {};

  const uids: string[] = [
    ...(Array.isArray(data.adminUids) ? data.adminUids : []),
    ...(Array.isArray(data.admins?.uids) ? data.admins.uids : []),
    ...splitEnv("PLATFORM_ADMIN_UIDS"),
  ]
    .map((u) => String(u).trim())
    .filter(Boolean);

  if (uids.includes(uid)) {
    return;
  }

  // Resolve email from Auth (user may have stored email in settings.adminEmails)
  let email = "";
  try {
    const user = await admin.auth().getUser(uid);
    email = (user.email || "").trim().toLowerCase();
  } catch {
    /* ignore */
  }

  const emails: string[] = [
    ...(Array.isArray(data.adminEmails) ? data.adminEmails : []),
    ...(Array.isArray(data.admins?.emails) ? data.admins.emails : []),
    ...splitEnv("PLATFORM_ADMIN_EMAILS"),
  ]
    .map((e) => String(e).trim().toLowerCase())
    .filter(Boolean);

  if (email && emails.includes(email)) {
    return;
  }

  throw new HttpsError(
    "permission-denied",
    `Platform admin only. Signed-in uid=${uid}` +
      (email ? ` email=${email}` : "") +
      ". Add this UID to platform/settings.adminUids or this email to platform/settings.adminEmails."
  );
}

export async function writePlatformAudit(
  actorId: string,
  action: string,
  details: Record<string, unknown> = {}
) {
  await admin
    .firestore()
    .collection("platform")
    .doc("auditLogs")
    .collection("entries")
    .add({
      actorId,
      action,
      details,
      createdAt: new Date().toISOString(),
    });
}
