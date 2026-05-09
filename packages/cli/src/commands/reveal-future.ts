import "dotenv/config";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import kleur from "kleur";
import type { Event } from "@rcrb/core";
import { loadSourcesFromEnv, NoSubscriptionSourceError } from "../source-config.js";
import { advanceAllSeedClocksTo, pushEvalEventsToStripe } from "../seed/stripe.js";
import { pushSentryEvents } from "../seed/sentry.js";
import { pushPostHogEvents } from "../seed/posthog.js";
import { readStaged } from "../seed/staged.js";

export async function runRevealFuture(): Promise<void> {
  let bundle;
  try {
    bundle = loadSourcesFromEnv();
  } catch (err) {
    if (err instanceof NoSubscriptionSourceError) {
      console.error(kleur.red(`✗ ${err.message}`));
      process.exit(2);
    }
    throw err;
  }

  const staged = await readStaged();
  console.log(
    kleur.cyan().bold(
      `⏭  Reveal future · ${staged.events.length} staged events · cutoff ${staged.cutoff_iso} → ${staged.eval_until_iso}`
    )
  );

  const evalSince = new Date(staged.cutoff_iso);
  const evalUntil = new Date(staged.eval_until_iso);

  // Push eval-window events to existing seeded sandbox state. Critical: this
  // does NOT call pushTrainToSources because that would create new customers +
  // new test clocks, contaminating the eval window. Instead:
  //   • Stripe: look up existing seed customers by metadata, apply cancels +
  //     PM swaps to them. Each API call fires at wall-clock-of-reveal, after
  //     the seed's wall-clock cutoff, so the events land in eval backfill.
  //   • PostHog: capture eval events with their synthetic timestamps preserved
  //     via historical_migration.
  //   • Sentry: same — push synthetic-timestamped error events.
  if (bundle.enabled.stripe) {
    console.log(kleur.cyan(`   • Stripe: applying eval cancels/payment failures to existing customers...`));
    try {
      const r = await pushEvalEventsToStripe(
        { apiKey: process.env.STRIPE_API_KEY! },
        staged.events
      );
      console.log(
        kleur.dim(
          `     ✓ stripe: ${r.cancels_pushed} cancels · ${r.payment_failures_pushed} payment failures · ${r.events_skipped} skipped`
        )
      );
      for (const note of r.notes) {
        console.log(kleur.dim(`       note: ${note}`));
      }
    } catch (err) {
      console.warn(
        kleur.yellow(
          `     ⚠ Stripe eval push failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  if (bundle.enabled.posthog && process.env.POSTHOG_PROJECT_API_KEY) {
    console.log(kleur.cyan(`   • PostHog: capturing eval events...`));
    try {
      const phCfg: { projectApiKey: string; host?: string } = {
        projectApiKey: process.env.POSTHOG_PROJECT_API_KEY,
      };
      if (process.env.POSTHOG_HOST) phCfg.host = process.env.POSTHOG_HOST;
      const r = await pushPostHogEvents(phCfg, staged.events);
      console.log(
        kleur.dim(`     ✓ posthog: ${r.events_pushed} events pushed · ${r.events_skipped} skipped`)
      );
    } catch (err) {
      console.warn(
        kleur.yellow(
          `     ⚠ PostHog eval push failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  if (bundle.enabled.sentry) {
    console.log(kleur.cyan(`   • Sentry: capturing eval error events...`));
    try {
      const sentryCfg: { dsn?: string; authToken?: string; orgSlug?: string; projectSlug?: string } = {
        ...(process.env.SENTRY_DSN ? { dsn: process.env.SENTRY_DSN } : {}),
        ...(process.env.SENTRY_AUTH_TOKEN ? { authToken: process.env.SENTRY_AUTH_TOKEN } : {}),
        ...(process.env.SENTRY_ORG_SLUG ? { orgSlug: process.env.SENTRY_ORG_SLUG } : {}),
        ...(process.env.SENTRY_PROJECT_SLUG ? { projectSlug: process.env.SENTRY_PROJECT_SLUG } : {}),
      };
      const r = await pushSentryEvents(sentryCfg, staged.events);
      console.log(
        kleur.dim(`     ✓ sentry: ${r.events_pushed} events pushed · ${r.events_skipped} skipped`)
      );
    } catch (err) {
      console.warn(
        kleur.yellow(
          `     ⚠ Sentry eval push failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  // Advance existing seed clocks to the eval-window end so any pending
  // renewal/dunning events fire on the simulated timeline.
  let clockAdvanced: { clock_ids: string[]; final_iso: string } | null = null;
  if (bundle.enabled.stripe) {
    try {
      clockAdvanced = await advanceAllSeedClocksTo(
        { apiKey: process.env.STRIPE_API_KEY! },
        evalUntil
      );
      if (clockAdvanced) {
        const summary =
          clockAdvanced.clock_ids.length === 1
            ? clockAdvanced.clock_ids[0]
            : `${clockAdvanced.clock_ids.length} clocks`;
        console.log(
          kleur.dim(
            `   • advanced Stripe test clock ${summary} → ${clockAdvanced.final_iso}`
          )
        );
      } else {
        console.log(
          kleur.yellow(
            `   ⚠ no rcrb_seed_* test clock found — eval-window subscription events may not have fired`
          )
        );
      }
    } catch (err) {
      console.warn(
        kleur.yellow(
          `   ⚠ test clock advance to eval end failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  // Real-API actuals: backfill the eval window from every configured source
  // and collect cancel events. This is the round-trip that proves the seed
  // actually persisted with simulated timestamps.
  const realActuals = new Set<string>();
  let realActualEvents = 0;
  const sourceCounts: Record<string, number> = {};
  for (const source of bundle.sources) {
    let n = 0;
    try {
      for await (const event of source.backfill({ since: evalSince, until: evalUntil })) {
        n++;
        if (event.kind === "subscription.cancel") {
          realActuals.add(event.user_id);
          realActualEvents++;
        }
      }
    } catch (err) {
      console.warn(
        kleur.yellow(
          `   ⚠ ${source.name} backfill failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
    sourceCounts[source.name] = n;
    console.log(kleur.dim(`   • ${source.name} eval-window backfill: ${n} events`));
  }

  // Local staged actuals for cross-check.
  const stagedActuals = new Set<string>();
  for (const e of staged.events) {
    if (e.kind === "subscription.cancel") stagedActuals.add(e.user_id);
  }

  // Find most recent briefing-*.md
  const briefingPath = await findMostRecentBriefing();
  if (!briefingPath) {
    console.error(
      kleur.red(`✗ no briefing-*.md found in ${process.cwd()} — run \`rc-retention-brain run\` first`)
    );
    process.exit(2);
  }
  console.log(kleur.cyan(`📄 Loading prior briefing: ${briefingPath}`));
  const briefingMd = await readFile(briefingPath, "utf8");
  const flaggedFromBriefing = parseFlaggedFromBriefing(briefingMd);
  const briefingThreshold = parseThresholdFromBriefing(briefingMd) ?? 0.4;

  // Briefing may encode flagged users by email or by raw user_id; normalize
  // both forms against the staged user_emails map so we can intersect with the
  // user_id-keyed actuals.
  const emailToUserId = new Map<string, string>();
  for (const [uid, em] of Object.entries(staged.user_emails)) emailToUserId.set(em, uid);
  const flaggedUserIds = new Set<string>();
  for (const label of flaggedFromBriefing) {
    if (label.includes("@")) {
      const uid = emailToUserId.get(label);
      if (uid) flaggedUserIds.add(uid);
    } else {
      flaggedUserIds.add(label);
    }
  }

  // Primary metric: real-API actuals (with fallback to staged if real is empty
  // — which means the round-trip didn't surface anything, likely a config gap).
  const usingRealActuals = realActuals.size > 0;
  const actuals = usingRealActuals ? realActuals : stagedActuals;
  const caught: string[] = [];
  for (const u of actuals) {
    if (flaggedUserIds.has(u)) caught.push(u);
  }
  const precision =
    flaggedUserIds.size === 0 ? 0 : caught.length / flaggedUserIds.size;
  const recall = actuals.size === 0 ? 0 : caught.length / actuals.size;
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const missed = [...actuals].filter((u) => !flaggedUserIds.has(u));

  // Drift between real-API and local staged (round-trip integrity check).
  const onlyInReal = [...realActuals].filter((u) => !stagedActuals.has(u));
  const onlyInStaged = [...stagedActuals].filter((u) => !realActuals.has(u));

  const dateStr = new Date().toISOString().slice(0, 10);
  const outPath = resolve(process.cwd(), `temporal-holdout-${dateStr}.md`);
  const md = renderHoldoutReport({
    briefingPath,
    cutoffIso: staged.cutoff_iso,
    evalUntilIso: staged.eval_until_iso,
    threshold: briefingThreshold,
    flaggedCount: flaggedUserIds.size,
    realActualCount: realActuals.size,
    stagedActualCount: stagedActuals.size,
    usingRealActuals,
    caught: caught.length,
    missed,
    precision,
    recall,
    f1,
    pushedEvents: staged.events.length,
    sourceCounts,
    clockAdvanced,
    onlyInReal,
    onlyInStaged,
    realActualEvents,
  });
  await writeFile(outPath, md, "utf8");

  console.log("");
  console.log(kleur.green(`📊 Temporal holdout result (real-API actuals):`));
  console.log(
    kleur.green(
      `   Flagged at ≥${briefingThreshold.toFixed(2)}: ${flaggedUserIds.size}`
    )
  );
  console.log(
    kleur.green(
      `   Actual churners (real APIs): ${realActuals.size}  · staged sanity: ${stagedActuals.size}  · caught: ${caught.length}`
    )
  );
  console.log(
    kleur.green(
      `   Precision ${precision.toFixed(2)} · Recall ${recall.toFixed(2)} · F1 ${f1.toFixed(2)}`
    )
  );
  if (onlyInReal.length > 0 || onlyInStaged.length > 0) {
    console.log(
      kleur.yellow(
        `   ⚠ round-trip drift — only-in-real: ${onlyInReal.length}, only-in-staged: ${onlyInStaged.length}`
      )
    );
  }
  console.log(kleur.dim(`   Wrote ${outPath}`));
}

async function findMostRecentBriefing(): Promise<string | null> {
  const entries = await readdir(process.cwd());
  const matches = entries.filter((n) => /^briefing-\d{4}-\d{2}-\d{2}\.md$/.test(n));
  if (matches.length === 0) return null;
  matches.sort();
  const last = matches[matches.length - 1];
  if (!last) return null;
  return resolve(process.cwd(), last);
}

// Briefing parsing — matches the renderer's `### N. <label> — risk X.YZ` lines.
// We extract user IDs from the surrounding context: prefer email-shaped labels,
// fall back to seed_*-shaped IDs that the renderer emits when no email is set.
export function parseFlaggedFromBriefing(md: string): string[] {
  const out: string[] = [];
  // Top N user blocks
  const headerRe = /^### \d+\.\s+(.+?)\s+—\s+risk\s+\d+\.\d+/gm;
  let m: RegExpExecArray | null;
  while ((m = headerRe.exec(md)) !== null) {
    const label = m[1]!.trim();
    out.push(label);
  }
  // Plus the "Remaining flagged users" list — `- `user_id` — risk 0.42 · top: name`
  const remainingRe = /^-\s+`([^`]+)`\s+—\s+risk\s+\d+\.\d+/gm;
  while ((m = remainingRe.exec(md)) !== null) {
    out.push(m[1]!.trim());
  }
  return out;
}

export function parseThresholdFromBriefing(md: string): number | null {
  const m = /flagged at risk \(≥(\d+\.\d+)\)/.exec(md);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

function renderHoldoutReport(args: {
  briefingPath: string;
  cutoffIso: string;
  evalUntilIso: string;
  threshold: number;
  flaggedCount: number;
  realActualCount: number;
  stagedActualCount: number;
  usingRealActuals: boolean;
  caught: number;
  missed: string[];
  precision: number;
  recall: number;
  f1: number;
  pushedEvents: number;
  sourceCounts: Record<string, number>;
  clockAdvanced: { clock_ids: string[]; final_iso: string } | null;
  onlyInReal: string[];
  onlyInStaged: string[];
  realActualEvents: number;
}): string {
  const lines: string[] = [];
  lines.push(`# Temporal Holdout — ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(`**Briefing:** \`${args.briefingPath}\``);
  lines.push(`**Eval window:** ${args.cutoffIso} → ${args.evalUntilIso}`);
  lines.push(`**Pushed staged events:** ${args.pushedEvents}`);
  if (args.clockAdvanced) {
    const ids = args.clockAdvanced.clock_ids;
    const summary =
      ids.length === 1
        ? `\`${ids[0]}\``
        : `${ids.length} clocks (\`${ids[0]}\`, …)`;
    lines.push(
      `**Stripe test clock:** ${summary} advanced to ${args.clockAdvanced.final_iso}`
    );
  }
  lines.push("");
  lines.push("## Result");
  lines.push("");
  lines.push(
    `- Flagged at ≥${args.threshold.toFixed(2)}: **${args.flaggedCount}**`
  );
  lines.push(
    `- Actual churners (real-API backfill): **${args.realActualCount}** (${args.realActualEvents} cancel events)`
  );
  lines.push(`- Actual churners (local staged sanity): **${args.stagedActualCount}**`);
  if (!args.usingRealActuals) {
    lines.push(
      `- ⚠ Real-API actuals empty — falling back to local staged file. Likely missing source config (see Method).`
    );
  }
  lines.push(`- Caught: **${args.caught}** / ${args.usingRealActuals ? args.realActualCount : args.stagedActualCount}`);
  lines.push(
    `- **Precision ${args.precision.toFixed(2)} · Recall ${args.recall.toFixed(2)} · F1 ${args.f1.toFixed(2)}**`
  );
  lines.push("");
  lines.push("### Per-source eval-window event counts");
  lines.push("");
  for (const [name, n] of Object.entries(args.sourceCounts)) {
    lines.push(`- \`${name}\`: ${n}`);
  }
  lines.push("");
  if (args.onlyInReal.length > 0 || args.onlyInStaged.length > 0) {
    lines.push("### Round-trip drift");
    lines.push("");
    lines.push(
      `Real-API actuals and the local staged file should agree. Drift means events were lost in transit (Stripe test clock didn't fire as expected, or the connector dropped them on read-back).`
    );
    lines.push("");
    if (args.onlyInReal.length > 0) {
      lines.push(`- Only in real-API (${args.onlyInReal.length}):`);
      for (const u of args.onlyInReal) lines.push(`  - \`${u}\``);
    }
    if (args.onlyInStaged.length > 0) {
      lines.push(`- Only in staged (${args.onlyInStaged.length}):`);
      for (const u of args.onlyInStaged) lines.push(`  - \`${u}\``);
    }
    lines.push("");
  }
  if (args.missed.length > 0) {
    lines.push("## Missed churners");
    lines.push("");
    for (const u of args.missed) lines.push(`- \`${u}\``);
    lines.push("");
  }
  lines.push("## Method");
  lines.push("");
  lines.push(
    "Temporal split: a 60-day synthetic timeline was generated; the first 30 days were pushed to the configured sandboxes (no peek at future) and the briefing was generated from real-API reads of that train window. The remaining 30 days were staged locally to `.staged-future.json`. `reveal-future` then pushed the staged window to the sandboxes — for Stripe this means advancing the Test Clock through the eval timeline so subscription/payment events fire at simulated timestamps — and computed actual-vs-predicted on `subscription.cancel` outcomes."
  );
  lines.push("");
  lines.push("## Ground-truth provenance");
  lines.push("");
  lines.push(
    "Actuals are read from real APIs after pushing the eval window to sandboxes. Cross-checked against the local staged file for round-trip integrity — drift, if any, is surfaced above. Stripe Test Clocks make the round-trip temporally accurate: customer + subscription objects are attached to a frozen clock that advances through the synthetic timeline, so Stripe emits `customer.subscription.created`, `customer.subscription.deleted`, `invoice.payment_failed`, etc. with the simulated timestamps and the connector reads them back via `events.list`."
  );
  lines.push("");
  return lines.join("\n");
}
