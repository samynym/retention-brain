import { z } from "zod";

export const EventKind = z.enum([
  "subscription.purchase",
  "subscription.renewal",
  "subscription.cancel",
  "subscription.refund",
  "subscription.trial_start",
  "subscription.trial_end",
  "payment.success",
  "payment.failure",
  "payment.retry",
  "usage.session",
  "usage.feature",
  "support.ticket_open",
  "support.ticket_message",
  "support.ticket_close",
  "error.client",
  "error.crash",
  "review.submitted",
]);
export type EventKind = z.infer<typeof EventKind>;

export const EventSource = z.enum([
  "synthetic",
  "revenuecat",
  "stripe",
  "mixpanel",
  "sentry",
  "crisp",
  "posthog",
  "firebase",
]);
export type EventSource = z.infer<typeof EventSource>;

export const Event = z.object({
  id: z.string(),
  user_id: z.string(),
  kind: EventKind,
  timestamp: z.string(),
  source: EventSource,
  payload: z.record(z.unknown()),
});
export type Event = z.infer<typeof Event>;
