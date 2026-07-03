import kleur from "kleur";
import { syntheticSource } from "@retention-brain/sources/synthetic";
import { buildTimelines, hasLLMKey, type Event } from "@retention-brain/core";
import { scoreAll } from "@retention-brain/risk-engine";
import { generateAll } from "@retention-brain/intervention-agent";
import { evalPredictions } from "@retention-brain/eval";

const DAY_MS = 86_400_000;
const DEMO_THRESHOLD = 0.4;

function parsePositiveInt(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    console.error(kleur.red(`invalid --${name}: ${value} (expected positive integer)`));
    process.exit(2);
  }
  return n;
}

export async function runDemo(opts: { users: string; days: string; seed: string }) {
  const num_users = parsePositiveInt(opts.users, "users");
  const days = parsePositiveInt(opts.days, "days");
  const seed = opts.seed;
  const start = new Date("2026-01-01T00:00:00.000Z");

  console.log(kleur.cyan().bold(`Loading synthetic stream: ${num_users} users, ${days} days of events`));

  const src = syntheticSource({ num_users, days, seed, start_date: start });
  const events: Event[] = [];
  for await (const e of src.backfill({
    since: new Date(start.getTime() - 60 * DAY_MS),
    until: new Date(start.getTime() + days * DAY_MS),
  })) {
    events.push(e);
  }
  const timelines = buildTimelines(events);

  console.log(kleur.cyan(`Risk Engine: scoring ${timelines.length} users...`));
  const scores = await scoreAll(timelines, { useLLM: false });
  const flagged = scores.filter((s) => s.score >= DEMO_THRESHOLD).sort((a, b) => b.score - a.score);
  console.log(`   • ${kleur.yellow(flagged.length.toString())} users flagged at risk (>=${DEMO_THRESHOLD.toFixed(2)})`);

  const sigCounts = new Map<string, number>();
  for (const s of flagged) {
    const top = s.top_signals[0];
    if (!top) continue;
    sigCounts.set(top.name, (sigCounts.get(top.name) ?? 0) + 1);
  }
  if (sigCounts.size > 0) {
    const sigSummary = [...sigCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} (${v})`)
      .join(", ");
    console.log(`   • Top signals: ${sigSummary}`);
  }

  if (flagged.length > 0 && hasLLMKey()) {
    console.log(kleur.cyan(`Intervention Agent: generating plays for top 5...`));
    const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));
    const interventions = await generateAll(scores, tlByUser, { threshold: DEMO_THRESHOLD, max: 5 });
    for (const i of interventions) {
      console.log("");
      console.log(`User ${kleur.bold(i.user_id)} (risk ${i.risk_score.toFixed(2)})`);
      console.log(`  Why: ${i.reasoning}`);
      const offerStr =
        i.offer.kind === "none"
          ? "no offer"
          : `${i.offer.kind}${i.offer.value !== undefined ? `=${i.offer.value}` : ""}`;
      console.log(`  Play: ${i.channel} · ${offerStr} · ${i.timing}`);
      if (i.copy.subject) console.log(`  Subject: ${i.copy.subject}`);
      console.log(`  Body: ${i.copy.body.slice(0, 200)}${i.copy.body.length > 200 ? "..." : ""}`);
    }
  } else if (!hasLLMKey()) {
    console.log(kleur.dim(`(set ANTHROPIC_API_KEY or OPENAI_API_KEY to generate interventions)`));
  }

  console.log("");
  const predEval = evalPredictions(scores, src.ground_truth, DEMO_THRESHOLD);
  console.log(
    kleur.green(
      `Eval: precision ${predEval.precision.toFixed(2)} / recall ${predEval.recall.toFixed(2)} / F1 ${predEval.f1.toFixed(2)} vs synthetic ground truth`
    )
  );
}
