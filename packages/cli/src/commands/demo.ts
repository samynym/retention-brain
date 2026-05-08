import kleur from "kleur";
import { syntheticSource } from "@rcrb/sources/synthetic";
import { buildTimelines, type Event } from "@rcrb/core";
import { scoreAll } from "@rcrb/risk-engine";
import { generateAll } from "@rcrb/intervention-agent";
import { evalPredictions } from "@rcrb/eval";

const DAY_MS = 86_400_000;

export async function runDemo(opts: { users: string; days: string; seed: string }) {
  const num_users = parseInt(opts.users, 10);
  const days = parseInt(opts.days, 10);
  const seed = opts.seed;
  const start = new Date("2026-01-01T00:00:00.000Z");

  console.log(kleur.cyan().bold(`🧠 Loading synthetic stream: ${num_users} users, ${days} days of events`));

  const src = syntheticSource({ num_users, days, seed, start_date: start });
  const events: Event[] = [];
  for await (const e of src.backfill({
    since: new Date(start.getTime() - 60 * DAY_MS),
    until: new Date(start.getTime() + days * DAY_MS),
  })) {
    events.push(e);
  }
  const timelines = buildTimelines(events);

  console.log(kleur.cyan(`📊 Risk Engine: scoring ${timelines.length} users...`));
  const scores = await scoreAll(timelines, { useLLM: false });
  const flagged = scores.filter((s) => s.score >= 0.4).sort((a, b) => b.score - a.score);
  console.log(`   • ${kleur.yellow(flagged.length.toString())} users flagged at risk (>=0.40)`);

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

  if (process.env.ANTHROPIC_API_KEY) {
    console.log(kleur.cyan(`🤖 Intervention Agent: generating plays for top 5...`));
    const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));
    const interventions = await generateAll(scores, tlByUser, { threshold: 0.4, max: 5 });
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
  } else {
    console.log(kleur.dim(`(set ANTHROPIC_API_KEY to generate interventions)`));
  }

  console.log("");
  const predEval = evalPredictions(scores, src.ground_truth, 0.4);
  console.log(
    kleur.green(
      `✅ Eval: precision ${predEval.precision.toFixed(2)} / recall ${predEval.recall.toFixed(2)} / F1 ${predEval.f1.toFixed(2)} vs synthetic ground truth`
    )
  );
}
