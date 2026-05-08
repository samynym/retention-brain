import { createHmac, timingSafeEqual } from "node:crypto";
import type { Event } from "@rcrb/core";
import { KIND_MAP } from "./kinds.js";

export type WebhookEvent = {
  type: string;
  id?: string;
  app_user_id: string;
  product_id?: string | null;
  event_timestamp_ms: number;
  expiration_at_ms?: number | null;
  store?: string;
  environment?: string;
  is_refunded?: boolean;
};

// RC uses a configured Authorization header (shared secret) by default; some setups
// front the webhook with an HMAC-signing proxy. We accept both: if `signature` looks
// like "sha256=<hex>" we verify HMAC-SHA256, else we constant-time compare to the secret.
export function verifyWebhook(rawBody: string, signature: string, secret: string): boolean {
  if (!signature || !secret) return false;
  const sigBuf = Buffer.from(signature);
  if (signature.startsWith("sha256=")) {
    const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
    const expectedBuf = Buffer.from(`sha256=${expected}`);
    if (sigBuf.length !== expectedBuf.length) return false;
    return timingSafeEqual(sigBuf, expectedBuf);
  }
  const bearer = signature.startsWith("Bearer ") ? signature.slice(7) : signature;
  const bearerBuf = Buffer.from(bearer);
  const secretBuf = Buffer.from(secret);
  if (bearerBuf.length !== secretBuf.length) return false;
  return timingSafeEqual(bearerBuf, secretBuf);
}

export function mapWebhookEvent(event: WebhookEvent): Event | null {
  const kind = KIND_MAP[event.type];
  if (!kind) return null;

  const payload: Record<string, unknown> = {};
  if (event.product_id) payload.product_id = event.product_id;
  if (event.type === "EXPIRATION") payload.reason = "expiration";
  if (event.store) payload.store = event.store;
  if (event.environment) payload.environment = event.environment;
  if (event.is_refunded) payload.refunded = true;

  return {
    id: `rc_${event.id ?? `${event.app_user_id}_${event.event_timestamp_ms}`}`,
    user_id: event.app_user_id,
    kind,
    timestamp: new Date(event.event_timestamp_ms).toISOString(),
    source: "revenuecat",
    payload,
  };
}
