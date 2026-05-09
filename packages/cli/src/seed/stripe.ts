import Stripe from "stripe";
import type { Event } from "@rcrb/core";
import type { SeedPushResult } from "./types.js";

export type StripeSeedConfig = { apiKey: string };

const SEED_METADATA_KEY = "rcrb_seed";
const CLOCK_NAME_PREFIX = "rcrb_seed_";
const TEST_PRICE_LOOKUP_KEY = "rcrb_test_pro_monthly";
// Stripe enforces a hard limit of 3 customers per Test Clock. Larger seed runs
// are sharded across multiple clocks; each clock holds up to MAX_CUSTOMERS_PER_CLOCK
// users and walks its own slice of the timeline.
const MAX_CUSTOMERS_PER_CLOCK = 3;

export type StripeSeedResult = SeedPushResult & {
  source: "stripe";
  test_clock_ids?: string[];
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

  // Shard users across test clocks: Stripe permits at most
  // MAX_CUSTOMERS_PER_CLOCK customers per clock, so we partition users into
  // shards of that size, and seed each shard against its own clock.
  const userIds: string[] = [];
  {
    const seen = new Set<string>();
    for (const e of events) {
      if (!seen.has(e.user_id)) {
        seen.add(e.user_id);
        userIds.push(e.user_id);
      }
    }
  }

  const shards: string[][] = [];
  for (let i = 0; i < userIds.length; i += MAX_CUSTOMERS_PER_CLOCK) {
    shards.push(userIds.slice(i, i + MAX_CUSTOMERS_PER_CLOCK));
  }

  const clockIds: string[] = [];
  let latestClockSec = startSec;
  const eventsByUser = new Map<string, Event[]>();
  for (const e of events) {
    const arr = eventsByUser.get(e.user_id) ?? [];
    arr.push(e);
    eventsByUser.set(e.user_id, arr);
  }

  for (let shardIdx = 0; shardIdx < shards.length; shardIdx++) {
    const shardUsers = shards[shardIdx]!;
    const shardEvents = shardUsers.flatMap((uid) => eventsByUser.get(uid) ?? []);
    if (shardEvents.length === 0) continue;

    const shardLastSec = await seedShard({
      stripe,
      shardUsers,
      shardEvents,
      userEmails,
      testPriceId,
      startSec,
      shardLabel: `${shardIdx + 1}/${shards.length}`,
      result,
      onClockCreated: (id) => clockIds.push(id),
    });
    if (shardLastSec > latestClockSec) latestClockSec = shardLastSec;
  }

  if (clockIds.length > 0) result.test_clock_ids = clockIds;
  result.final_frozen_time_iso = new Date(latestClockSec * 1000).toISOString();
  return result;
}

/**
 * Seeds a single shard of up to MAX_CUSTOMERS_PER_CLOCK users against one
 * Test Clock. Mutates `result` (events_pushed / events_skipped / notes /
 * customers_created) so caller can aggregate across shards.
 */
async function seedShard(args: {
  stripe: Stripe;
  shardUsers: string[];
  shardEvents: Event[];
  userEmails: Record<string, string>;
  testPriceId: string;
  startSec: number;
  shardLabel: string;
  result: StripeSeedResult;
  onClockCreated: (clockId: string) => void;
}): Promise<number> {
  const { stripe, shardUsers, shardEvents, userEmails, testPriceId, startSec, result } = args;

  const clock = await stripe.testHelpers.testClocks.create({
    frozen_time: startSec,
    name: `${CLOCK_NAME_PREFIX}${Date.now()}_s${args.shardLabel.replace("/", "of")}`,
  });
  args.onClockCreated(clock.id);
  await waitForClockReady(stripe, clock.id);

  const customerByUser = new Map<string, string>();
  for (const userId of shardUsers) {
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

  // Only advance the clock for events Stripe actually acts on. Usage/error/
  // support timestamps would force needless multi-second clock advances; Stripe
  // auto-emits renewal invoices when the clock crosses billing boundaries
  // regardless, so skipping them is safe.
  const STRIPE_ACTIONABLE = new Set([
    "subscription.purchase",
    "subscription.cancel",
    "payment.failure",
  ]);
  result.events_skipped += shardEvents.length;
  const sortedEvents = shardEvents
    .filter((e) => STRIPE_ACTIONABLE.has(e.kind))
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  result.events_skipped -= sortedEvents.length;
  let lastClockSec = startSec;
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
        if (result.notes.length < 5) {
          result.notes.push(
            `clock advance (shard ${args.shardLabel}) to ${e.timestamp} failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
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
      // Use Stripe's global test PM that always declines on charge. Older code
      // tried `paymentMethods.create({ card: { token: "tok_chargeDeclined" } })`
      // but that token is rejected at create-time by current API versions.
      // The pm_card_chargeDeclined test PM is shared across all test accounts
      // and only declines when Stripe attempts an actual charge — exactly the
      // shape we want for a deferred renewal failure.
      try {
        await stripe.paymentMethods.attach("pm_card_chargeDeclined", {
          customer: customerId,
        });
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: "pm_card_chargeDeclined" },
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
  }

  return lastClockSec;
}

// Stripe rejects single advances longer than 2 subscription intervals. For
// monthly subs that's ~60 days; we chunk at 50 to leave headroom for
// minute-of-day differences and any internal Stripe normalization.
const MAX_ADVANCE_CHUNK_SEC = 50 * 86_400;

async function advanceClockInChunks(
  stripe: Stripe,
  clockId: string,
  targetSec: number
): Promise<void> {
  let current = (await stripe.testHelpers.testClocks.retrieve(clockId)).frozen_time;
  while (current < targetSec) {
    const nextStep = Math.min(current + MAX_ADVANCE_CHUNK_SEC, targetSec);
    await advanceClockTo(stripe, clockId, nextStep);
    current = nextStep;
  }
}

/**
 * Advances every Stripe Test Clock named with `CLOCK_NAME_PREFIX` to a target
 * time, chunking the advance to respect Stripe's 2-subscription-interval limit
 * per single advance. Used by reveal-future after pushing the eval window.
 * Returns the list of clock ids advanced (or already past target), or null if
 * no seed clock exists.
 */
export async function advanceAllSeedClocksTo(
  cfg: StripeSeedConfig,
  target: Date
): Promise<{ clock_ids: string[]; final_iso: string } | null> {
  const stripe = new Stripe(cfg.apiKey);
  const clocks: Stripe.TestHelpers.TestClock[] = [];
  for await (const clock of stripe.testHelpers.testClocks.list({ limit: 100 })) {
    if (!clock.name || !clock.name.startsWith(CLOCK_NAME_PREFIX)) continue;
    clocks.push(clock);
  }
  if (clocks.length === 0) return null;
  const targetSec = Math.floor(target.getTime() / 1000);
  for (const clock of clocks) {
    if (targetSec <= clock.frozen_time) continue;
    await advanceClockInChunks(stripe, clock.id, targetSec);
  }
  return { clock_ids: clocks.map((c) => c.id), final_iso: target.toISOString() };
}

export type StripeEvalPushResult = SeedPushResult & {
  source: "stripe";
  cancels_pushed: number;
  payment_failures_pushed: number;
};

/**
 * Applies eval-window subscription.cancel and payment.failure events to
 * EXISTING seed customers (looked up by metadata.rcrb_user_id). Does not
 * create new customers or test clocks — those are train-phase only. Each
 * Stripe API call here fires at wall-clock-of-reveal, so the events have
 * `created` > seed's wall-clock cutoff and land cleanly in the eval-window
 * backfill query.
 */
export async function pushEvalEventsToStripe(
  cfg: StripeSeedConfig,
  events: Event[]
): Promise<StripeEvalPushResult> {
  if (!cfg.apiKey.startsWith("sk_test_") && !cfg.apiKey.startsWith("rk_test_")) {
    throw new Error(
      "STRIPE_API_KEY must be a test-mode key (starts with sk_test_ or rk_test_) — refusing to push eval events to live mode"
    );
  }
  const stripe = new Stripe(cfg.apiKey);

  const result: StripeEvalPushResult = {
    source: "stripe",
    customers_created: 0,
    customers_deleted: 0,
    events_pushed: 0,
    events_skipped: 0,
    cancels_pushed: 0,
    payment_failures_pushed: 0,
    notes: [],
  };

  // Build user_id → customer_id map from existing seed customers.
  const customerByUser = new Map<string, string>();
  for await (const cu of stripe.customers.list({ limit: 100 })) {
    if (cu.metadata?.[SEED_METADATA_KEY] !== "1") continue;
    const uid = cu.metadata?.rcrb_user_id;
    if (uid) customerByUser.set(uid, cu.id);
  }

  if (customerByUser.size === 0) {
    result.notes.push(
      "no rcrb_seed customers found — did seed-sandbox run on this account?"
    );
    result.events_skipped = events.length;
    return result;
  }

  // Apply only billing-relevant eval events. PostHog/Sentry events are pushed
  // through their own connectors with synthetic timestamps preserved.
  for (const e of events) {
    if (e.kind !== "subscription.cancel" && e.kind !== "payment.failure") {
      result.events_skipped++;
      continue;
    }
    const customerId = customerByUser.get(e.user_id);
    if (!customerId) {
      result.events_skipped++;
      continue;
    }

    if (e.kind === "subscription.cancel") {
      try {
        const list = await stripe.subscriptions.list({
          customer: customerId,
          status: "active",
          limit: 1,
        });
        const subId = list.data[0]?.id;
        if (!subId) {
          result.events_skipped++;
          continue;
        }
        await stripe.subscriptions.cancel(subId);
        result.events_pushed++;
        result.cancels_pushed++;
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
      try {
        await stripe.paymentMethods.attach("pm_card_chargeDeclined", {
          customer: customerId,
        });
        await stripe.customers.update(customerId, {
          invoice_settings: { default_payment_method: "pm_card_chargeDeclined" },
        });
        result.events_pushed++;
        result.payment_failures_pushed++;
      } catch (err) {
        result.events_skipped++;
        if (result.notes.length < 5) {
          result.notes.push(
            `payment.failure for ${e.user_id} failed: ${err instanceof Error ? err.message : String(err)}`
          );
        }
      }
    }
  }

  return result;
}
