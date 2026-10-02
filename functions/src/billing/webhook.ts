/**
 * HTTP webhook for Paystack charge.success events.
 */

import { onRequest } from "firebase-functions/v2/https";
import * as admin from "firebase-admin";
import * as crypto from "crypto";
import { getPaystackSecretKey, getPaystackWebhookSecret } from "./config";
import { activatePlanFromVerification } from "./activatePlan";
import type { VerifyResponse } from "./paystackClient";

export const paystackWebhook = onRequest({ cors: false }, async (req, res) => {
  if (req.method !== "POST") {
    res.status(405).send("Method Not Allowed");
    return;
  }

  const secret = getPaystackWebhookSecret() || getPaystackSecretKey();
  if (!secret) {
    console.error("Paystack secret not configured");
    res.status(500).send("Server misconfigured");
    return;
  }

  const signature = req.headers["x-paystack-signature"] as string | undefined;
  const rawBody =
    typeof (req as any).rawBody !== "undefined"
      ? (req as any).rawBody
      : Buffer.from(JSON.stringify(req.body));

  if (signature) {
    const hash = crypto.createHmac("sha512", secret).update(rawBody).digest("hex");
    if (hash !== signature) {
      console.warn("Invalid Paystack webhook signature");
      res.status(401).send("Invalid signature");
      return;
    }
  }

  const event = req.body;
  if (!event || event.event !== "charge.success") {
    res.status(200).json({ received: true, processed: false });
    return;
  }

  const data = event.data as VerifyResponse & {
    metadata?: { schoolId?: string; plan?: string; paymentId?: string };
  };

  const reference = data.reference;
  const schoolId = data.metadata?.schoolId;

  if (!reference || !schoolId) {
    console.error("Webhook missing reference or schoolId metadata", { reference, schoolId });
    res.status(400).json({ error: "Missing reference or schoolId" });
    return;
  }

  try {
    const result = await activatePlanFromVerification(schoolId, reference, data, "webhook");

    await admin
      .firestore()
      .collection("platform")
      .doc("auditLogs")
      .collection("entries")
      .add({
        action: "paystack.webhook.charge_success",
        schoolId,
        reference,
        alreadyProcessed: result.alreadyProcessed,
        plan: result.plan,
        createdAt: new Date().toISOString(),
      });

    res.status(200).json({ received: true, processed: !result.alreadyProcessed });
  } catch (e: unknown) {
    console.error("Webhook activation error", e);
    const msg = e instanceof Error ? e.message : "error";
    if (msg.includes("not found")) {
      res.status(404).json({ error: msg });
      return;
    }
    res.status(200).json({ received: true, processed: false, error: msg });
  }
});