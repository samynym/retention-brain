import Stripe from "stripe";
import type { Source } from "@rcrb/sources";
import { stripeApi, type StripeConfig } from "./api.js";
import { mapStripeEvent } from "./map.js";

export function stripeSource(config: StripeConfig): Source {
  const api = stripeApi(config);
  // Stripe's events.list cannot expand customer.metadata, so invoice/charge
  // events arrive without app_user_id and fall back to cus_* in the mapper.
  // Resolve app_user_id once per customer to keep timelines unified.
  const stripe = new Stripe(config.apiKey, { typescript: true });
  type Resolution = { appUserId: string | null; deleted: boolean };
  const customerResolution = new Map<string, Resolution>();
  async function resolveCustomer(customerId: string): Promise<Resolution> {
    const cached = customerResolution.get(customerId);
    if (cached) return cached;
    try {
      const c = await stripe.customers.retrieve(customerId);
      const r: Resolution =
        "deleted" in c
          ? { appUserId: null, deleted: true }
          : { appUserId: c.metadata?.app_user_id ?? null, deleted: false };
      customerResolution.set(customerId, r);
      return r;
    } catch {
      const r: Resolution = { appUserId: null, deleted: false };
      customerResolution.set(customerId, r);
      return r;
    }
  }
  return {
    name: "stripe",
    async *backfill({ since, until }) {
      for await (const event of api.listEvents({ since, until })) {
        const mapped = mapStripeEvent(event);
        if (!mapped) continue;
        if (mapped.user_id.startsWith("cus_")) {
          const r = await resolveCustomer(mapped.user_id);
          // Stale event: customer was deleted, so this event no longer belongs
          // to any active timeline. Skip rather than emit an orphan.
          if (r.deleted) continue;
          if (r.appUserId) mapped.user_id = r.appUserId;
        }
        yield mapped;
      }
    },
  };
}

export type { StripeConfig };
export { mapStripeEvent } from "./map.js";
export { verifyAndMap } from "./webhook.js";
export { KIND_MAP } from "./kinds.js";
