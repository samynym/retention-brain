import Stripe from "stripe";
import { Event } from "@retention-brain/core";
import type { EventSource } from "./types.js";

/**
 * Native Stripe source: reads a Stripe account via its API and expands its
 * objects into the engine's Event timeline. Deterministic (no LLM) and one
 * Stripe object can become several events — a subscription yields a purchase
 * and (if ended) a cancel; a charge yields a payment success or failure. This
 * is billing-only signal by nature (Stripe knows payments, not product usage).
 *
 * (We use the SDK rather than @stripe/mcp here: the MCP exposes resource-list
 * tools for current state, which can't cleanly reconstruct a historical event
 * timeline — the exact gap the architecture notes for Stripe.)
 */
export function stripeSource(apiKey: string, name = "stripe"): EventSource {
  const stripe = new Stripe(apiKey);
  return {
    name,
    async *backfill({ since, until }) {
      const sinceUnix = Math.floor(since.getTime() / 1000);
      const untilUnix = Math.floor(until.getTime() / 1000);
      const within = (u: number) => u >= sinceUnix && u <= untilUnix;
      const iso = (u: number) => new Date(u * 1000).toISOString();
      const idOf = (
        v: string | Stripe.Customer | Stripe.DeletedCustomer | null,
      ): string | null => (typeof v === "string" ? v : (v?.id ?? null));

      // customer id -> email, so timelines carry a readable identity
      const email = new Map<string, string>();
      for await (const c of stripe.customers.list({ limit: 100 })) {
        if (c.email) email.set(c.id, c.email);
      }

      // subscriptions -> purchase (+ cancel)
      for await (const s of stripe.subscriptions.list({ status: "all", limit: 100 })) {
        const cust = idOf(s.customer);
        if (!cust) continue;
        const em = email.get(cust);
        if (within(s.created)) {
          yield Event.parse({
            id: `${s.id}:created`,
            user_id: cust,
            kind: "subscription.purchase",
            timestamp: iso(s.created),
            source: "stripe",
            payload: { email: em, subscription: s.id, status: s.status },
          });
        }
        if (s.canceled_at && within(s.canceled_at)) {
          yield Event.parse({
            id: `${s.id}:canceled`,
            user_id: cust,
            kind: "subscription.cancel",
            timestamp: iso(s.canceled_at),
            source: "stripe",
            payload: {
              email: em,
              subscription: s.id,
              reason: s.cancellation_details?.reason ?? undefined,
            },
          });
        }
      }

      // charges -> payment success / failure
      for await (const ch of stripe.charges.list({ created: { gte: sinceUnix }, limit: 100 })) {
        const cust = idOf(ch.customer);
        if (!cust || !within(ch.created)) continue;
        const kind =
          ch.status === "succeeded"
            ? "payment.success"
            : ch.status === "failed"
              ? "payment.failure"
              : null;
        if (!kind) continue;
        yield Event.parse({
          id: ch.id,
          user_id: cust,
          kind,
          timestamp: iso(ch.created),
          source: "stripe",
          payload: {
            email: email.get(cust) ?? ch.billing_details?.email ?? undefined,
            amount: ch.amount / 100,
            currency: ch.currency,
          },
        });
      }
    },
  };
}
