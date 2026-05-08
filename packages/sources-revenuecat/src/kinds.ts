import type { EventKind } from "@rcrb/core";

export const KIND_MAP: Record<string, EventKind> = {
  INITIAL_PURCHASE: "subscription.purchase",
  RENEWAL: "subscription.renewal",
  PRODUCT_CHANGE: "subscription.purchase",
  CANCELLATION: "subscription.cancel",
  EXPIRATION: "subscription.cancel",
  BILLING_ISSUE: "payment.failure",
  NON_RENEWING_PURCHASE: "subscription.purchase",
};
