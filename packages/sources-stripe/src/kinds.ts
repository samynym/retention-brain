import type { EventKind } from "@rcrb/core";

// Renewal invoices map to payment.success rather than subscription.renewal because
// the subscription state didn't change — see PLAN.md notes for the gap.
export const KIND_MAP: Record<string, EventKind> = {
  "customer.subscription.created": "subscription.purchase",
  "customer.subscription.deleted": "subscription.cancel",
  "customer.subscription.trial_will_end": "subscription.trial_end",
  "invoice.payment_succeeded": "payment.success",
  "invoice.payment_failed": "payment.failure",
  "charge.failed": "payment.failure",
  "charge.refunded": "subscription.refund",
};
