import Stripe from "stripe";
import type { Event } from "@rcrb/core";
import type { SeedPushResult } from "./types.js";

export type StripeSeedConfig = { apiKey: string };

const SEED_METADATA_KEY = "rcrb_seed";
const CLOCK_NAME_PREFIX = "rcrb_seed_";
const TEST_PRICE_LOOKUP_KEY = "rcrb_test_pro_monthly";

export type StripeSeedResult = SeedPushResult & {
  source: "stripe";
  test_clock_id?: string;
  final_frozen_time_iso?: string;
};

export async function deleteSeededTestClocks(stripe: Stripe): Promise<number> {
  let deleted = 0;
  for await (const clock of stripe.testHelpers.testClocks.list({ limit: 100 })) {
    if (!clock.name || !clock.name.startsWith(CLOCK_NAME_PREFIX)) continue;
    try {
      await stripe.testHelpers.testClocks.del(clock.id);
      deleted++;
    } catch {
      // already gone or in a transitional state — best effort
    }
  }
  return deleted;
}

export async function deleteSeededStripeCustomers(stripe: Stripe): Promise<number> {
  // Test-clock deletion cascades to clock-attached customers, but defensively
  // sweep any leftover seed customers (e.g. orphaned from older runs).
  let deleted = 0;
  for await (const customer of stripe.customers.list({ limit: 100 })) {
    if (customer.metadata?.[SEED_METADATA_KEY] !== "1") continue;
    try {
      await stripe.customers.del(customer.id);
      deleted++;
    } catch {
      // already gone
    }
  }
  return deleted;
}

async function ensureTestPrice(stripe: Stripe): Promise<string> {
  const existing = await stripe.prices.list({
    lookup_keys: [TEST_PRICE_LOOKUP_KEY],
    active: true,
    limit: 1,
  });
  const found = existing.data[0];
  if (found) return found.id;

  const product = await stripe.products.create({ name: "rcrb test pro" });
  const price = await stripe.prices.create({
    product: product.id,
    unit_amount: 999,
    currency: "usd",
    recurring: { interval: "month" },
    lookup_key: TEST_PRICE_LOOKUP_KEY,
  });
  return price.id;
}

async function waitForClockReady(
  stripe: Stripe,
  clockId: string,
  maxWaitMs = 60_000
): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const c = await stripe.testHelpers.testClocks.retrieve(clockId);
    if (c.status === "ready") return;
    if (c.status === "internal_failure") {
      throw new Error(`Test clock ${clockId} entered internal_failure`);
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  throw new Error(`Test clock ${clockId} did not become ready within ${maxWaitMs}ms`);
}

async function advanceClockTo(
  stripe: Stripe,
  clockId: string,
  unixSeconds: number
): Promise<void> {
  await stripe.testHelpers.testClocks.advance(clockId, { frozen_time: unixSeconds });
  await waitForClockReady(stripe, clockId);
}

/**
 * Seeds Stripe test mode with synthetic billing history using Test Clocks. The
 * clock is frozen at the timeline start, customers are created attached to it,
 * then the clock is advanced through each subscription event in chronological
 * order so Stripe emits real `customer.subscription.*` and `invoice.*` events
 * with simulated timestamps. RC, configured to read from this Stripe account,
 * observes the events naturally — no direct RC writes are needed.
 *
 * Mapping:
 *   subscription.purchase  → stripe.subscriptions.create
 *   subscription.cancel    → stripe.subscriptions.cancel (immediate)
 *   payment.failure        → swap default PM to pm_card_chargeDeclined before
 *                            advancing past the next renewal; Stripe emits
 *                            invoice.payment_failed when it tries to charge.
 *   payment.success/usage/error/support → not pushed via Stripe (out of scope
 *                                         for the billing source).
 */
export async function pushStripeEvents(
  cfg: StripeSeedConfig,
  events: Event[],
  userEmails: Record<string, string>,
  opts: { idempotentReset: boolean; syntheticStart?: Date }
): Promise<StripeSeedResult> {
  if (!cfg.apiKey.startsWith("sk_test_") && !cfg.apiKey.startsWith("rk_test_")) {
    throw new Error(
      "STRIPE_API_KEY must be a test-mode key (starts with sk_test_ or rk_test_) — refusing to seed live mode"
    );
  }
  const stripe = new Stripe(cfg.apiKey);

  const result: StripeSeedResult = {
    source: "stripe",
    customers_created: 0,
    customers_deleted: 0,
    events_pushed: 0,
    events_skipped: 0,
    notes: [],
  };

  if (opts.idempotentReset) {
    try {
      const clocksDeleted = await deleteSeededTestClocks(stripe);
      const customersDeleted = await deleteSeededStripeCustomers(stripe);
      result.customers_deleted = customersDeleted;
      if (clocksDeleted > 0) {
        result.notes.push(`deleted ${clocksDeleted} prior test clock(s)`);
      }
    } catch (err) {
      result.notes.push(
        `delete-prior failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  if (events.length === 0) {
    return result;
  }

  // Determine the clock's starting frozen_time. We use the earliest event
  // timestamp by default; callers can override via syntheticStart so the clock
  // begins at the train-window start regardless of the first event.
  const eventMsList = events
    .map((e) => new Date(e.timestamp).getTime())
    .filter((n) => Number.isFinite(n));
  const earliestEventMs = Math.min(...eventMsList);
  const startMs = opts.syntheticStart
    ? Math.min(opts.syntheticStart.getTime(), earliestEventMs)
    : earliestEventMs;
  // Stripe rejects frozen_time in the past beyond the safety window — but for a
  // synthetic timeline that's strictly in the past relative to wall-clock now,
  // Stripe accepts any past second. We floor to seconds to match the API.
  const startSec = Math.floor(startMs / 1000);

  const testPriceId = await ensureTestPrice(stripe);

  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: startSec,
    name: `${CLOCK_NAME_PREFIX}${Date.now()}`,
  });
  result.test_clock_id = clock.id;
  // Newly-created clocks are immediately ready, but be defensive.
  await waitForClockReady(stripe, clock.id);

  // Per-user customer creation. Each customer is attached to the clock and
  // tagged with metadata so subsequent runs can reset them, and so the Stripe
  // source's `metadata.app_user_id` cross-source match works out of the box.
  const userIds = new Set<string>();
  for (const e of events) userIds.add(e.user_id);

  const customerByUser = new Map<string, string>();
  for (const userId of userIds) {
    const email = userEmails[userId];
    const created = await stripe.customers.create({
      ...(email ? { email } : {}),
      description: `rcrb seed user ${userId}`,
      test_clock: clock.id,
      payment_method: "pm_card_visa",
      invoice_settings: { default_payment_method: "pm_card_visa" },
      metadata: {
        [SEED_METADATA_KEY]: "1",
        rcrb_user_id: userId,
        app_user_id: userId,
      },
    });
    customerByUser.set(userId, created.id);
    result.customers_created++;
  }

  // Walk the timeline in chronological order. Advance the clock once per
  // unique timestamp to keep the round-trip cost down (each advance is a
  // multi-second async operation server-side).
  const sortedEvents = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let lastClockSec = startSec;
  // Track the active subscription per user so cancel operations can target it.
  const activeSubByUser = new Map<string, string>();

  for (const e of sortedEvents) {
    const customerId = customerByUser.get(e.user_id);
    if (!customerId) {
      result.events_skipped++;
      continue;
    }

    const eventSec = Math.floor(new Date(e.timestamp).getTime() / 1000);
    if (eventSec > lastClockSec) {
      try {
        await advanceClockTo(stripe, clock.id, eventSec);
        lastClockSec = eventSec;
      } catch (err) {
        result.notes.push(
          `clock advance to ${e.timestamp} failed: ${err instanceof Error ? err.message : String(err)}`
        );
        result.events_skipped++;
        continue;
      }
    }

    if (e.kind === "subscription.purchase") {
      try {
        const sub = await stripe.subscriptions.create({
          customer: customerId,
          items: [{ price: testPriceId }],
          metadata: {
            [SEED_METADATA_KEY]: "1",
            rcrb_user_id: e.user_id,
            app_user_id: e.user_id,
          },
        });
        activeSubByUser.set(e.user_id, sub.id);
        result.events_pushed++;
      } catch (err) {
        result.events_skipped++;
        if (result.notes.length < 5) {
          result.notes.push(
            `subscription.create for ${e.user_id} failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      continue;
    }

    if (e.kind === "subscription.cancel") {
      let subId = activeSubByUser.get(e.user_id);
      if (!subId) {
        // Fall back to fetching active subs in case the purchase event wasn't
        // in this batch (e.g. partial re-run).
        const list = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 1,
        });
        subId = list.data[0]?.id;
      }
      if (!subId) {
        result.events_skipped++;
        continue;
      }
      try {
        await stripe.subscriptions.cancel(subId);
        activeSubByUser.delete(e.user_id);
        result.events_pushed++;
      } catch (err) {
        result.events_skipped++;
        if (result.notes.length < 5) {
          result.notes.push(
            `subscription.cancel for ${e.user_id} failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      continue;
    }

    if (e.kind === "payment.failure") {
      // Swap the default payment method to a card that always declines so the
      // next auto-renewal attempt fails. Stripe emits invoice.payment_failed
      // when it tries to charge the renewal.
      try {
        const pm = await stripe.paymentMethods.create({
          type: "card",
          card: { token: "tok_chargeDeclined" },
        });
        await stripe.paymentMethods.attach(pm.id, { customer: customerId });
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: pm.id },
        });
        result.events_pushed++;
      } catch (err) {
        result.events_skipped++;
        if (result.notes.length < 5) {
          result.notes.push(
            `payment.failure setup for ${e.user_id} failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
      continue;
    }

    // payment.success / payment.retry / subscription.renewal / usage.* /
    // error.* / support.* / review.submitted are emitted naturally by Stripe
    // as the clock crosses renewal boundaries (or are out of scope for the
    // billing source). They're skipped here — the eval window will produce
    // them via clock advance + auto-renewal.
    result.events_skipped++;
  }

  result.final_frozen_time_iso = new Date(lastClockSec * 1000).toISOString();
  return result;
}

/**
 * Advances the Stripe Test Clock named with `CLOCK_NAME_PREFIX` (the most
 * recently created one) to a target time, used by reveal-future after pushing
 * the eval window. Returns the clock id and the final frozen time, or null if
 * no seed clock exists.
 */
export async function advanceLatestSeedClockTo(
  cfg: StripeSeedConfig,
  target: Date
): Promise<{ clock_id: string; final_iso: string } | null> {
  const stripe = new Stripe(cfg.apiKey);
  let latest: Stripe.TestHelpers.TestClock | null = null;
  for await (const clock of stripe.testHelpers.testClocks.list({ limit: 100 })) {
    if (!clock.name || !clock.name.startsWith(CLOCK_NAME_PREFIX)) continue;
    if (!latest || clock.created > latest.created) latest = clock;
  }
  if (!latest) return null;
  const targetSec = Math.floor(target.getTime() / 1000);
  if (targetSec <= latest.frozen_time) {
    return { clock_id: latest.id, final_iso: new Date(latest.frozen_time * 1000).toISOString() };
  }
  await advanceClockTo(stripe, latest.id, targetSec);
  return { clock_id: latest.id, final_iso: target.toISOString() };
}
