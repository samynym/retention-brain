import { Event, type EventKind } from "@rcrb/core";

// Stripe event.type → our EventKind. Renewal invoices map to payment.success
// rather than subscription.renewal because subscription state didn't change.
const KIND_MAP: Record<string, EventKind> = {
  "customer.subscription.created": "subscription.purchase",
  "customer.subscription.deleted": "subscription.cancel",
  "customer.subscription.trial_will_end": "subscription.trial_end",
  "invoice.payment_succeeded": "payment.success",
  "invoice.payment_failed": "payment.failure",
  "charge.failed": "payment.failure",
  "charge.refunded": "subscription.refund",
};

export function mapStripeWebhook(body: unknown): Event | null {
  if (!body || typeof body !== "object") return null;
  const evt = body as Record<string, unknown>;
  const type = typeof evt.type === "string" ? evt.type : "";
  const kind = KIND_MAP[type];
  if (!kind) return null;

  const data = (evt.data as { object?: Record<string, unknown> } | undefined)?.object ?? {};
  const userId = extractUserId(data);
  if (!userId) return null;

  const ts = extractTimestamp(evt, data);

  const candidate = {
    id: typeof evt.id === "string" ? evt.id : `stripe-wh:${ts}:${userId}`,
    user_id: userId,
    kind,
    timestamp: ts,
    source: "mcp" as const,
    payload: {
      stripe_event_type: type,
      object: data,
    },
  };

  const parsed = Event.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function extractUserId(obj: Record<string, unknown>): string | null {
  const meta = obj.metadata as Record<string, unknown> | undefined;
  if (meta && typeof meta.app_user_id === "string") return meta.app_user_id;
  if (typeof obj.customer === "string") return obj.customer;
  if (typeof obj.customer_email === "string") return obj.customer_email;
  return null;
}

function extractTimestamp(evt: Record<string, unknown>, obj: Record<string, unknown>): string {
  const created = typeof evt.created === "number" ? evt.created : undefined;
  if (created) return new Date(created * 1000).toISOString();
  const objCreated = typeof obj.created === "number" ? obj.created : undefined;
  if (objCreated) return new Date(objCreated * 1000).toISOString();
  return new Date().toISOString();
}
