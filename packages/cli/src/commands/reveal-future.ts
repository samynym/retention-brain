import "dotenv/config";
import { readdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import kleur from "kleur";
import type { Event } from "@rcrb/core";
import { loadSourcesFromEnv, NoSubscriptionSourceError } from "../source-config.js";
import { pushTrainToSources } from "../seed/index.js";
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

  const pushOpts: Parameters<typeof pushTrainToSources>[0] = {
    enabled: bundle.enabled,
    idempotentReset: false,
  };
  if (bundle.enabled.revenuecat) {
    pushOpts.rcConfig = {
      apiKey: process.env.REVENUECAT_API_KEY!,
      projectId: process.env.REVENUECAT_PROJECT_ID!,
    };
  }
  if (bundle.enabled.stripe) {
    pushOpts.stripeConfig = { apiKey: process.env.STRIPE_API_KEY! };
  }
  if (bundle.enabled.sentry) {
    pushOpts.sentryConfig = {
      ...(process.env.SENTRY_DSN ? { dsn: process.env.SENTRY_DSN } : {}),
      ...(process.env.SENTRY_AUTH_TOKEN ? { authToken: process.env.SENTRY_AUTH_TOKEN } : {}),
      ...(process.env.SENTRY_ORG_SLUG ? { orgSlug: process.env.SENTRY_ORG_SLUG } : {}),
      ...(process.env.SENTRY_PROJECT_SLUG ? { projectSlug: process.env.SENTRY_PROJECT_SLUG } : {}),
    };
  }
  if (bundle.enabled.posthog && process.env.POSTHOG_PROJECT_API_KEY) {
    const phCfg: { projectApiKey: string; host?: string } = {
      projectApiKey: process.env.POSTHOG_PROJECT_API_KEY,
    };
    if (process.env.POSTHOG_HOST) phCfg.host = process.env.POSTHOG_HOST;
    pushOpts.posthogConfig = phCfg;
  }

  await pushTrainToSources(pushOpts, staged.events, staged.user_emails);

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

  // Compute actuals: which staged users have a subscription.cancel?
  const actualChurners = new Set<string>();
  for (const e of staged.events) {
    if (e.kind === "subscription.cancel") actualChurners.add(e.user_id);
  }

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
  const caught: string[] = [];
  for (const u of actualChurners) {
    if (flaggedUserIds.has(u)) caught.push(u);
  }
  const precision =
    flaggedUserIds.size === 0 ? 0 : caught.length / flaggedUserIds.size;
  const recall = actualChurners.size === 0 ? 0 : caught.length / actualChurners.size;
  const f1 =
    precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const missed = [...actualChurners].filter((u) => !flaggedUserIds.has(u));

  const dateStr = new Date().toISOString().slice(0, 10);
  const outPath = resolve(process.cwd(), `temporal-holdout-${dateStr}.md`);
  const md = renderHoldoutReport({
    briefingPath,
    cutoffIso: staged.cutoff_iso,
    evalUntilIso: staged.eval_until_iso,
    threshold: briefingThreshold,
    flaggedCount: flaggedUserIds.size,
    actualChurners: actualChurners.size,
    caught: caught.length,
    missed,
    precision,
    recall,
    f1,
    pushedEvents: staged.events.length,
  });
  await writeFile(outPath, md, "utf8");

  console.log("");
  console.log(kleur.green(`📊 Temporal holdout result:`));
  console.log(
    kleur.green(
      `   Flagged at ≥${briefingThreshold.toFixed(2)}: ${flaggedUserIds.size}`
    )
  );
  console.log(
    kleur.green(
      `   Actual churners in eval window: ${actualChurners.size}  · caught: ${caught.length}`
    )
  );
  console.log(
    kleur.green(
      `   Precision ${precision.toFixed(2)} · Recall ${recall.toFixed(2)} · F1 ${f1.toFixed(2)}`
    )
  );
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
  actualChurners: number;
  caught: number;
  missed: string[];
  precision: number;
  recall: number;
  f1: number;
  pushedEvents: number;
}): string {
  const lines: string[] = [];
  lines.push(`# Temporal Holdout — ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push(`**Briefing:** \`${args.briefingPath}\``);
  lines.push(`**Eval window:** ${args.cutoffIso} → ${args.evalUntilIso}`);
  lines.push(`**Pushed events to sandboxes:** ${args.pushedEvents}`);
  lines.push("");
  lines.push("## Result");
  lines.push("");
  lines.push(
    `- Flagged at ≥${args.threshold.toFixed(2)}: **${args.flaggedCount}**`
  );
  lines.push(`- Actual churners in eval window: **${args.actualChurners}**`);
  lines.push(`- Caught: **${args.caught}** / ${args.actualChurners}`);
  lines.push(
    `- **Precision ${args.precision.toFixed(2)} · Recall ${args.recall.toFixed(2)} · F1 ${args.f1.toFixed(2)}**`
  );
  lines.push("");
  if (args.missed.length > 0) {
    lines.push("## Missed churners");
    lines.push("");
    for (const u of args.missed) lines.push(`- \`${u}\``);
    lines.push("");
  }
  lines.push("## Method");
  lines.push("");
  lines.push(
    "Temporal split: a 60-day synthetic timeline was generated; the first 30 days were pushed to the configured sandboxes (no peek at future) and the briefing was generated from real-API reads of that train window. The remaining 30 days were staged locally to `.staged-future.json`. `reveal-future` then pushed the staged window to the sandboxes (best-effort — see Phase 7 limits below) and computed actual-vs-predicted on `subscription.cancel` outcomes."
  );
  lines.push("");
  lines.push("## Ground-truth provenance");
  lines.push("");
  lines.push(
    "**Actuals are read from the local staged file, not from a sandbox round-trip.** The seed-sandbox push is best-effort — RC v2 has no public POST /transactions endpoint, Stripe pushes `paymentIntents.create` events whose `created` timestamp is current-time (not the synthetic timestamp), and Sentry/PostHog seeding is gated on optional keys. A sandbox round-trip would lose most of the cancel events. Treating the staged file as ground truth keeps the precision/recall measurement faithful to the synthetic generator's intent. The push step still validates that connectors accept and round-trip the data shape — the briefing reads from real APIs in `run`, only the actuals comparison uses the local staged truth."
  );
  lines.push("");
  return lines.join("\n");
}
