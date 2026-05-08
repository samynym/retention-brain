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
  /** Anchor of the train window. Default: now − evalDays (so eval is "the future"). */
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
  const start = opts.start ?? new Date(Date.now() - opts.evalDays * DAY_MS);
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

  const trainCutoffMs = start.getTime() + opts.trainDays * DAY_MS;
  const evalUntilMs = start.getTime() + totalDays * DAY_MS;

  const trainEvents: Event[] = [];
  const evalEvents: Event[] = [];
  for (const e of events) {
    const ts = new Date(e.timestamp).getTime();
    if (ts < trainCutoffMs) trainEvents.push(e);
    else if (ts < evalUntilMs) evalEvents.push(e);
  }

  // Stage the eval window before attempting pushes — if pushes throw partway
  // through, reveal-future still has the local truth and we don't lose the run.
  const stagedPath = await writeStaged({
    generated_at: new Date().toISOString(),
    seed: opts.seed,
    cutoff_iso: new Date(trainCutoffMs).toISOString(),
    eval_until_iso: new Date(evalUntilMs).toISOString(),
    user_emails: userEmails,
    events: evalEvents,
  });

  const perSource = await pushTrainToSources(opts, trainEvents, userEmails, start);

  return {
    total_events: events.length,
    train_events: trainEvents.length,
    eval_events: evalEvents.length,
    cutoff_iso: new Date(trainCutoffMs).toISOString(),
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
      if (r.test_clock_id) {
        console.log(
          kleur.dim(
            `       test_clock=${r.test_clock_id} · final frozen_time=${r.final_frozen_time_iso ?? "—"}`
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
