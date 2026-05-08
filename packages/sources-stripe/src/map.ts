import type Stripe from "stripe";
import type { Event } from "@rcrb/core";
import { KIND_MAP } from "./kinds.js";

export function mapStripeEvent(event: Stripe.Event): Event | null {
  const kind = KIND_MAP[event.type];
  if (!kind) return null;

  const obj = event.data.object as {
    customer?: string | Stripe.Customer | Stripe.DeletedCustomer | null;
    customer_email?: string | null;
    metadata?: Stripe.Metadata | null;
  };
  const customerId = typeof obj.customer === "string" ? obj.customer : obj.customer?.id;
  if (!customerId) return null;

  const nestedEmail =
    obj.customer && typeof obj.customer === "object" && "email" in obj.customer
      ? obj.customer.email ?? undefined
      : undefined;
  const email = obj.customer_email ?? nestedEmail ?? undefined;
  // metadata.app_user_id is a convention we ask integrators to set when creating
  // the customer, so events are joinable to RC's app_user_id in the matcher.
  const appUserId = obj.metadata?.app_user_id;

  const payload: Record<string, unknown> = {};
  if (email) payload.email = email;
  if (appUserId) payload.app_user_id = appUserId;

  if (event.type === "invoice.payment_failed" || event.type === "charge.failed") {
    const failure = (event.data.object as { failure_message?: string | null }).failure_message;
    if (failure) payload.failure_message = failure;
  }
  if (event.type.startsWith("customer.subscription")) {
    const sub = event.data.object as { id?: string; status?: string };
    if (sub.id) payload.subscription_id = sub.id;
    if (sub.status) payload.status = sub.status;
  }

  return {
    id: `stripe_${event.id}`,
    user_id: appUserId ?? customerId,
    kind,
    timestamp: new Date(event.created * 1000).toISOString(),
    source: "stripe",
    payload,
  };
}
