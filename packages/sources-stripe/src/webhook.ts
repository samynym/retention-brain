import Stripe from "stripe";
import type { Event } from "@rcrb/core";
import { mapStripeEvent } from "./map.js";

export type WebhookConfig = {
  webhookSecret: string;
};

// constructEvent throws if signature verification fails — the caller (webhook
// route) catches and returns 400. We don't swallow it here.
export function verifyAndMap(
  rawBody: string | Buffer,
  signature: string,
  config: WebhookConfig,
): Event | null {
  const event = Stripe.webhooks.constructEvent(rawBody, signature, config.webhookSecret);
  return mapStripeEvent(event);
}
