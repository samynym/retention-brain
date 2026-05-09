import kleur from "kleur";
import { generate } from "@rcrb/sources/synthetic";
import type { Event } from "@rcrb/core";
import type { EnabledSources } from "../source-config.js";
import type { SeedPushResult } from "./types.js";
import { pushStripeEvents, type StripeSeedConfig } from "./stripe.js";
import { pushSentryEvents, type SentrySeedConfig } from "./sentry.js";
import { pushPostHogEvents, type PostHogSeedConfig } from "./posthog.js";
import { writeStaged } from "./staged.js";

// RC seeding is intentionally absent from this orchestrator. RC observes upstream
// billing platforms (Stripe / App Store / Google Play); to seed RC sandbox data,
// configure the RC sandbox to read from the same Stripe test mode account and
// push to Stripe — RC will observe the events naturally. See README §Sandbox
// setup for the one-time wiring.

export type SeedRunOpts = {
  trainDays: number;
  evalDays: number;
  numUsers: number;
  seed: string;
  /**
   * Anchor of the synthetic timeline. Default: now − trainDays, so the train
   * window's synthetic cutoff lands at wall-clock-now. This is what makes the
   * temporal holdout actually work: Stripe events fire at wall-clock-now (no
   * backdating possible), so they need to land in the train-window backfill —
   * which means cutoff must be ≥ wall-clock-of-seed-end. Reveal-future then
   * fires API calls strictly after the cutoff, landing them in eval.
   */
  start?: Date;
  enabled: EnabledSources;
  stripeConfig?: StripeSeedConfig;
  sentryConfig?: SentrySeedConfig;
  posthogConfig?: PostHogSeedConfig;
  idempotentReset: boolean;
};

const DAY_MS = 86_400_000;
const SEED_PREFIX = "seed_";

export type SeedRunResult = {
  total_events: number;
  train_events: number;
  eval_events: number;
  cutoff_iso: string;
  eval_until_iso: string;
  staged_path?: string;
  per_source: SeedPushResult[];
};

export async function runSeed(opts: SeedRunOpts): Promise<SeedRunResult> {
  // Anchor the synthetic timeline so the cutoff lands at wall-clock-now.
  // Synthetic events span [start, start + trainDays + evalDays]
  //   = [now − trainDays, now + evalDays].
  // Synthetic train events: timestamp < now (in the past)
  // Synthetic eval events:  timestamp ≥ now (in the future)
  const start = opts.start ?? new Date(Date.now() - opts.trainDays * DAY_MS);
  const totalDays = opts.trainDays + opts.evalDays;

  const { events: rawEvents } = generate({
    num_users: opts.numUsers,
    days: totalDays,
    seed: opts.seed,
    start_date: start,
  });

  // Re-key user IDs and emails so seeded customers land under predictable
  // namespaces and we can clean them up reliably on re-runs.
  const userEmails: Record<string, string> = {};
  const events: Event[] = rawEvents.map((e) => {
    const newUid = `${SEED_PREFIX}${e.user_id.replace(/^user_/, "")}`;
    if (!userEmails[newUid]) {
      userEmails[newUid] = `${newUid}@rcrb-test.local`;
    }
    return { ...e, user_id: newUid };
  });

  // Synthetic train/eval split — uses the synthetic timestamps on the events.
  // PostHog preserves these via historical_migration so the in-source filter
  // matches.
  const syntheticCutoffMs = start.getTime() + opts.trainDays * DAY_MS;
  const syntheticEvalUntilMs = start.getTime() + totalDays * DAY_MS;

  const trainEvents: Event[] = [];
  const evalEvents: Event[] = [];
  for (const e of events) {
    const ts = new Date(e.timestamp).getTime();
    if (ts < syntheticCutoffMs) trainEvents.push(e);
    else if (ts < syntheticEvalUntilMs) evalEvents.push(e);
  }

  const perSource = await pushTrainToSources(opts, trainEvents, userEmails, start);

  // Wall-clock cutoff: AFTER all train pushes complete. Stripe API calls fired
  // during pushTrainToSources have created < cutoffMs (they happened before
  // this point). Reveal-future will run later and any API calls it makes will
  // have created > cutoffMs → they land in the eval-window backfill query.
  const cutoffMs = Date.now();
  const evalUntilMs = cutoffMs + opts.evalDays * DAY_MS;

  // Stage the eval events with the wall-clock cutoff so reveal-future and the
  // brain agree on what's "future" relative to the seed.
  const stagedPath = await writeStaged({
    generated_at: new Date().toISOString(),
    seed: opts.seed,
    cutoff_iso: new Date(cutoffMs).toISOString(),
    eval_until_iso: new Date(evalUntilMs).toISOString(),
    user_emails: userEmails,
    events: evalEvents,
  });

  return {
    total_events: events.length,
    train_events: trainEvents.length,
    eval_events: evalEvents.length,
    cutoff_iso: new Date(cutoffMs).toISOString(),
    eval_until_iso: new Date(evalUntilMs).toISOString(),
    staged_path: stagedPath,
    per_source: perSource,
  };
}

export async function pushTrainToSources(
  opts: Pick<
    SeedRunOpts,
    "enabled" | "stripeConfig" | "sentryConfig" | "posthogConfig" | "idempotentReset"
  >,
  events: Event[],
  userEmails: Record<string, string>,
  syntheticStart?: Date
): Promise<SeedPushResult[]> {
  const out: SeedPushResult[] = [];

  if (opts.enabled.stripe && opts.stripeConfig) {
    console.log(
      kleur.cyan(`   • Stripe (test mode + Test Clocks): pushing customers + subscriptions...`)
    );
    try {
      const r = await pushStripeEvents(opts.stripeConfig, events, userEmails, {
        idempotentReset: opts.idempotentReset,
        ...(syntheticStart ? { syntheticStart } : {}),
      });
      logResult(r);
      if (r.test_clock_ids && r.test_clock_ids.length > 0) {
        const summary =
          r.test_clock_ids.length === 1
            ? r.test_clock_ids[0]
            : `${r.test_clock_ids.length} clocks (${r.test_clock_ids[0]}…)`;
        console.log(
          kleur.dim(
            `       test_clocks=${summary} · final frozen_time=${r.final_frozen_time_iso ?? "—"}`
          )
        );
      }
      out.push(r);
    } catch (err) {
      console.warn(
        kleur.yellow(
          `     ⚠ Stripe push failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  if (opts.enabled.sentry && opts.sentryConfig) {
    console.log(kleur.cyan(`   • Sentry: pushing error events...`));
    try {
      const r = await pushSentryEvents(opts.sentryConfig, events);
      logResult(r);
      out.push(r);
    } catch (err) {
      console.warn(
        kleur.yellow(
          `     ⚠ Sentry push failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  if (opts.enabled.posthog && opts.posthogConfig) {
    console.log(kleur.cyan(`   • PostHog: capturing events...`));
    try {
      const r = await pushPostHogEvents(opts.posthogConfig, events);
      logResult(r);
      out.push(r);
    } catch (err) {
      console.warn(
        kleur.yellow(
          `     ⚠ PostHog push failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  if (opts.enabled.revenuecat) {
    console.log(
      kleur.dim(
        `   • RevenueCat: skipped (RC observes Stripe in sandbox; see README §Sandbox setup)`
      )
    );
  }

  return out;
}

function logResult(r: SeedPushResult): void {
  console.log(
    kleur.dim(
      `     ✓ ${r.source}: ${r.customers_created} customers · ${r.events_pushed} events pushed · ${r.events_skipped} skipped`
    )
  );
  for (const note of r.notes) {
    console.log(kleur.dim(`       note: ${note}`));
  }
}
