import type { Event, EventKind } from "@rcrb/core";
import type { RCCustomer, RCTransaction } from "./api.js";

const KIND_MAP: Record<string, EventKind> = {
  INITIAL_PURCHASE: "subscription.purchase",
  RENEWAL: "subscription.renewal",
  PRODUCT_CHANGE: "subscription.purchase",
  CANCELLATION: "subscription.cancel",
  EXPIRATION: "subscription.cancel",
  BILLING_ISSUE: "payment.failure",
  NON_RENEWING_PURCHASE: "subscription.purchase",
};

function customerEmail(customer: RCCustomer): string | undefined {
  const attrs = customer.attributes;
  if (!attrs) return undefined;
  const email = attrs["$email"] ?? attrs["email"];
  return typeof email === "string" ? email : undefined;
}

export function mapTransaction(tx: RCTransaction, customer: RCCustomer): Event | null {
  const kind = KIND_MAP[tx.kind];
  if (!kind) return null;

  const email = customerEmail(customer);
  const payload: Record<string, unknown> = {};
  if (tx.product_id) payload.product_id = tx.product_id;
  if (tx.kind === "EXPIRATION") payload.reason = "expiration";
  if (tx.is_refunded) payload.refunded = true;
  if (email) payload.email = email;

  return {
    id: `rc_${tx.id}`,
    user_id: customer.id,
    kind,
    timestamp: new Date(tx.purchased_at).toISOString(),
    source: "revenuecat",
    payload,
  };
}
