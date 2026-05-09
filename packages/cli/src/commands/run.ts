import "dotenv/config";
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import kleur from "kleur";
import { buildTimelines, hasLLMKey, type Event, type Intervention } from "@rcrb/core";
import { scoreAll } from "@rcrb/risk-engine";
import { generateAll } from "@rcrb/intervention-agent";
import { loadSourcesFromEnv, NoSubscriptionSourceError } from "../source-config.js";
import { renderBriefing } from "../briefing.js";
import { tryReadStaged } from "../seed/staged.js";

const DAY_MS = 86_400_000;
const BACKFILL_DAYS = 60;
const TOP_INTERVENTIONS = 20;

function parseFraction(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    console.error(kleur.red(`invalid --${name}: ${value} (expected number in [0, 1])`));
    process.exit(2);
  }
  return n;
}

async function resolveAsOf(value: string | undefined): Promise<{ at: Date; from: "flag" | "staged" | "now" }> {
  if (value) {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) {
      console.error(kleur.red(`invalid --as-of: ${value} (expected ISO date)`));
      process.exit(2);
    }
    return { at: d, from: "flag" };
  }
  const staged = await tryReadStaged();
  if (staged) {
    return { at: new Date(staged.cutoff_iso), from: "staged" };
  }
  return { at: new Date(), from: "now" };
}

export async function runRun(opts: { asOf?: string; threshold: string }): Promise<void> {
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
  const threshold = parseFraction(opts.threshold, "threshold");
  const { at: now, from: asOfSource } = await resolveAsOf(opts.asOf);
  const since = new Date(now.getTime() - BACKFILL_DAYS * DAY_MS);

  const enabledNames = Object.entries(bundle.enabled)
    .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v))
    .map(([k, v]) => (Array.isArray(v) ? v.map((label) => `${k}:${label}`).join(",") : k));
  const asOfTag =
    asOfSource === "staged"
      ? " (from .staged-future.json)"
      : asOfSource === "flag"
        ? " (from --as-of)"
        : "";
  console.log(
    kleur.cyan().bold(
      `🧠 Briefing run · cutoff ${now.toISOString()}${asOfTag} · sources: ${enabledNames.join(", ")}`
    )
  );

  const events: Event[] = [];
  for (const src of bundle.sources) {
    let count = 0;
    try {
      for await (const e of src.backfill({ since, until: now })) {
        events.push(e);
        count++;
      }
      console.log(kleur.dim(`   • ${src.name}: ${count} events`));
    } catch (err) {
      console.warn(
        kleur.yellow(
          `   ⚠ ${src.name} backfill failed: ${err instanceof Error ? err.message : String(err)}`
        )
      );
    }
  }

  if (events.length === 0) {
    console.error(kleur.red("✗ no events pulled from any source — check credentials and try again"));
    process.exit(1);
  }

  const timelines = buildTimelines(events);
  console.log(kleur.cyan(`📊 Risk scoring ${timelines.length} users...`));
  const useLLM = hasLLMKey();
  const scores = await scoreAll(timelines, { useLLM, nowIso: now.toISOString() });
  const flagged = scores.filter((s) => s.score >= threshold);
  console.log(
    `   • ${kleur.yellow(flagged.length.toString())} flagged at ≥${threshold.toFixed(2)}`
  );

  let interventions: Intervention[] = [];
  if (useLLM && flagged.length > 0) {
    console.log(
      kleur.cyan(`🤖 Generating interventions for top ${Math.min(TOP_INTERVENTIONS, flagged.length)}...`)
    );
    const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));
    interventions = await generateAll(scores, tlByUser, {
      threshold,
      max: TOP_INTERVENTIONS,
    });
    console.log(kleur.dim(`   • ${interventions.length} drafted`));
  } else if (!useLLM) {
    console.log(
      kleur.dim("   (set ANTHROPIC_API_KEY or OPENAI_API_KEY to generate intervention drafts)")
    );
  }

  const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));
  const md = renderBriefing({
    date: now,
    cutoffIso: now.toISOString(),
    threshold,
    totalUsers: timelines.length,
    scores,
    timelinesByUser: tlByUser,
    interventions,
    enabledSources: enabledNames,
  });

  const dateStr = now.toISOString().slice(0, 10);
  const outPath = resolve(process.cwd(), `briefing-${dateStr}.md`);
  await writeFile(outPath, md, "utf8");

  const sigCounts = new Map<string, number>();
  for (const s of flagged) {
    const top = s.top_signals[0];
    if (!top) continue;
    sigCounts.set(top.name, (sigCounts.get(top.name) ?? 0) + 1);
  }
  const topDriverEntry = [...sigCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topDriver = topDriverEntry ? `${topDriverEntry[0]} (${topDriverEntry[1]})` : "—";

  console.log("");
  console.log(
    kleur.green(
      `✅ ${flagged.length} flagged · top driver: ${topDriver} · wrote ${outPath}`
    )
  );
}
