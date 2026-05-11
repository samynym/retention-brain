import { Event, type EventKind } from "@rcrb/core";

const KIND_MAP: Record<string, EventKind> = {
  INITIAL_PURCHASE: "subscription.purchase",
  RENEWAL: "subscription.renewal",
  PRODUCT_CHANGE: "subscription.purchase",
  CANCELLATION: "subscription.cancel",
  EXPIRATION: "subscription.cancel",
  BILLING_ISSUE: "payment.failure",
  NON_RENEWING_PURCHASE: "subscription.purchase",
};

export function mapRevenueCatWebhook(body: unknown): Event | null {
  if (!body || typeof body !== "object") return null;
  const root = body as Record<string, unknown>;
  // RC wraps the payload as { event: { type, app_user_id, event_timestamp_ms, ... } }
  const evt = (root.event ?? root) as Record<string, unknown>;
  const type = typeof evt.type === "string" ? evt.type : "";
  const kind = KIND_MAP[type];
  if (!kind) return null;

  const userId = typeof evt.app_user_id === "string" ? evt.app_user_id : null;
  if (!userId) return null;

  const ts = extractTimestamp(evt);

  const candidate = {
    id: typeof evt.id === "string" ? evt.id : `rc-wh:${ts}:${userId}`,
    user_id: userId,
    kind,
    timestamp: ts,
    source: "mcp" as const,
    payload: {
      rc_event_type: type,
      event: evt,
    },
  };

  const parsed = Event.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

function extractTimestamp(evt: Record<string, unknown>): string {
  const ms = typeof evt.event_timestamp_ms === "number" ? evt.event_timestamp_ms : undefined;
  if (ms) return new Date(ms).toISOString();
  const iso = typeof evt.event_timestamp === "string" ? evt.event_timestamp : undefined;
  if (iso) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) return d.toISOString();
  }
  return new Date().toISOString();
}
