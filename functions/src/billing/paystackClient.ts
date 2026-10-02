/**
 * Minimal Paystack HTTP client (server-side only).
 */

import { PAYSTACK_BASE, getPaystackSecretKey } from "./config";

export async function paystackRequest<T = unknown>(
  method: "GET" | "POST",
  path: string,
  body?: Record<string, unknown>
): Promise<T> {
  const secret = getPaystackSecretKey();
  if (!secret) {
    throw new Error("PAYSTACK_SECRET_KEY is not configured");
  }

  const res = await fetch(`${PAYSTACK_BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  const data = (await res.json()) as { status: boolean; message: string; data: T };
  if (!res.ok || !data.status) {
    throw new Error(data.message || `Paystack error ${res.status}`);
  }
  return data.data;
}

export interface InitializeResponse {
  authorization_url: string;
  access_code: string;
  reference: string;
}

export interface VerifyResponse {
  id: number;
  status: string;
  reference: string;
  amount: number;
  currency: string;
  paid_at: string | null;
  channel: string;
  customer: { email: string; customer_code: string };
  metadata?: Record<string, unknown>;
}