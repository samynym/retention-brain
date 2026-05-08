import Stripe from "stripe";
import type { Event } from "@rcrb/core";
import type { SeedPushResult } from "./revenuecat.js";

export type StripeSeedConfig = { apiKey: string };

const SEED_METADATA_KEY = "rcrb_seed";

export async function deleteSeededStripeCustomers(stripe: Stripe): Promise<number> {
  // Stripe doesn't expose metadata-keyed search on the basic customers.list, so
  // we paginate and filter. Test mode customers can be deleted permanently.
  let deleted = 0;
  for await (const customer of stripe.customers.list({ limit: 100 })) {
    if (customer.metadata?.[SEED_METADATA_KEY] !== "1") continue;
    try {
      await stripe.customers.del(customer.id);
      deleted++;
    } catch {
      // ignore; customer may already be gone
    }
  }
  return deleted;
}

export async function pushStripeEvents(
  cfg: StripeSeedConfig,
  events: Event[],
  userEmails: Record<string, string>,
  opts: { idempotentReset: boolean }
): Promise<SeedPushResult & { source: "stripe" }> {
  if (!cfg.apiKey.startsWith("sk_test_") && !cfg.apiKey.startsWith("rk_test_")) {
    throw new Error(
      "STRIPE_API_KEY must be a test-mode key (starts with sk_test_ or rk_test_) — refusing to seed live mode"
    );
  }
  const stripe = new Stripe(cfg.apiKey);
  const result = {
    source: "stripe" as const,
    customers_created: 0,
    customers_deleted: 0,
    events_pushed: 0,
    events_skipped: 0,
    notes: [] as string[],
  };

  if (opts.idempotentReset) {
    try {
      result.customers_deleted = await deleteSeededStripeCustomers(stripe);
    } catch (err) {
      result.notes.push(
        `delete-prior failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 1) Group events per user; create one customer per seeded user.
  const userIds = new Set<string>();
  for (const e of events) userIds.add(e.user_id);

  // We need a stable map from synthetic user_id → Stripe customer id so events
  // for the same user end up consistent. Stripe assigns IDs at creation time;
  // we look up by metadata first to support re-runs without reset.
  const customerByUser = new Map<string, string>();
  for (const userId of userIds) {
    const email = userEmails[userId];
    const existing = await stripe.customers.list({
      limit: 1,
      ...(email ? { email } : {}),
    });
    let customerId: string | undefined;
    for (const c of existing.data) {
      if (c.metadata?.[SEED_METADATA_KEY] === "1" && c.metadata?.["rcrb_user_id"] === userId) {
        customerId = c.id;
        break;
      }
    }
    if (!customerId) {
      const c = await stripe.customers.create({
        ...(email ? { email } : {}),
        description: `rcrb seed user ${userId}`,
        metadata: { [SEED_METADATA_KEY]: "1", rcrb_user_id: userId },
      });
      customerId = c.id;
      result.customers_created++;
    }
    customerByUser.set(userId, customerId);
  }

  // 2) For each event, push something Stripe-shaped. We use PaymentIntents for
  // payment success/failure (test mode supports forced outcomes via amount/PM
  // tokens). For subscription events, we can't easily replay timestamps in
  // sandbox; we annotate the customer's metadata with the latest known kind+ts.
  // Note: timestamps for created PaymentIntents will be ~now, not the synthetic
  // event time. The temporal holdout treats this as best-effort.
  for (const e of events) {
    const customerId = customerByUser.get(e.user_id);
    if (!customerId) {
      result.events_skipped++;
      continue;
    }
    if (e.kind === "payment.success" || e.kind === "payment.failure") {
      const amount = Math.round(((e.payload["amount"] as number | undefined) ?? 9.99) * 100);
      const currency = String(e.payload["currency"] ?? "usd").toLowerCase();
      try {
        const pm =
          e.kind === "payment.success" ? "pm_card_visa" : "pm_card_chargeDeclined";
        await stripe.paymentIntents.create({
          amount,
          currency,
          customer: customerId,
          payment_method: pm,
          confirm: true,
          off_session: true,
          // describe these as seed-originated for cleanup
          metadata: {
            [SEED_METADATA_KEY]: "1",
            rcrb_user_id: e.user_id,
            rcrb_kind: e.kind,
            rcrb_ts: e.timestamp,
          },
        });
        result.events_pushed++;
      } catch (err) {
        // declined card raises StripeCardError on confirmation — that IS the
        // failure outcome we wanted, so count it as pushed.
        if (err instanceof Stripe.errors.StripeCardError && e.kind === "payment.failure") {
          result.events_pushed++;
        } else {
          result.events_skipped++;
          if (result.notes.length < 5) {
            result.notes.push(
              `payment ${e.kind} for ${e.user_id} failed: ${err instanceof Error ? err.message : String(err)}`
            );
          }
        }
      }
      continue;
    }
    // subscription events: best-effort metadata annotation
    if (
      e.kind === "subscription.purchase" ||
      e.kind === "subscription.renewal" ||
      e.kind === "subscription.cancel" ||
      e.kind === "subscription.refund"
    ) {
      try {
        await stripe.customers.update(customerId, {
          metadata: {
            [`rcrb_last_${e.kind.replace(".", "_")}`]: e.timestamp,
          },
        });
        result.events_pushed++;
      } catch {
        result.events_skipped++;
      }
      continue;
    }
    result.events_skipped++;
  }
  if (result.events_skipped > 0) {
    result.notes.push(
      `Stripe seed pushes payment events as PaymentIntents and subscription events as customer metadata; non-billing kinds (usage/error/support) skipped.`
    );
  }
  return result;
}
