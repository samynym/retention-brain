// Inspect synthetic simulator output. Run: pnpm exec tsx scripts/inspect.ts

import { syntheticSource } from "../packages/sources/src/synthetic/index.js";
import { buildTimelines, type Event } from "../packages/core/src/index.js";
import { scoreAll } from "../packages/risk-engine/src/index.js";

const NUM_USERS = 1000;
const DAYS = 30;
const SEED = "inspect-baseline";
const START = new Date("2026-01-01T00:00:00.000Z");

console.log(`\n=== rc-retention-brain · simulator baseline ===`);
console.log(`seed=${SEED}  users=${NUM_USERS}  days=${DAYS}\n`);

const src = syntheticSource({
  num_users: NUM_USERS,
  days: DAYS,
  seed: SEED,
  start_date: START,
});

// Reach back 60 days to include pre-window initial purchases
const events: Event[] = [];
for await (const e of src.backfill({
  since: new Date(START.getTime() - 60 * 86_400_000),
  until: new Date(START.getTime() + DAYS * 86_400_000),
})) {
  events.push(e);
}
const timelines = buildTimelines(events);

console.log("--- 1. Persona distribution ---");
const personaCounts = new Map<string, number>();
for (const g of src.ground_truth) {
  personaCounts.set(g.persona, (personaCounts.get(g.persona) ?? 0) + 1);
}
const personaTable = [...personaCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(
    ([name, count]) =>
      `  ${name.padEnd(20)} ${count.toString().padStart(4)}  (${((count / NUM_USERS) * 100).toFixed(1)}%)`
  )
  .join("\n");
console.log(personaTable);
console.log(`  total                ${NUM_USERS}`);

console.log("\n--- 2. Event counts by kind ---");
const kindCounts = new Map<string, number>();
for (const e of events) {
  kindCounts.set(e.kind, (kindCounts.get(e.kind) ?? 0) + 1);
}
const kindTable = [...kindCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([k, n]) => `  ${k.padEnd(28)} ${n.toString().padStart(7)}`)
  .join("\n");
console.log(kindTable);
console.log(`  total events                 ${events.length}`);
console.log(`  avg events/user              ${(events.length / NUM_USERS).toFixed(1)}`);

console.log("\n--- 3. Churn rate per persona ---");
const churnByPersona = new Map<string, { total: number; churned: number }>();
for (const g of src.ground_truth) {
  const stats = churnByPersona.get(g.persona) ?? { total: 0, churned: 0 };
  stats.total += 1;
  if (g.will_churn) stats.churned += 1;
  churnByPersona.set(g.persona, stats);
}
const churnTable = [...churnByPersona.entries()]
  .sort((a, b) => b[1].churned / b[1].total - a[1].churned / a[1].total)
  .map(([name, s]) => {
    const rate = s.churned / s.total;
    return `  ${name.padEnd(20)} ${s.churned}/${s.total}  (${(rate * 100).toFixed(1)}%)`;
  })
  .join("\n");
console.log(churnTable);

console.log("\n--- 4. Sessions per persona: early window (days 0-6) vs late (days 23-29) ---");
const personaByUser = new Map<string, string>();
for (const g of src.ground_truth) personaByUser.set(g.user_id, g.persona);

const earlyByPersona = new Map<string, number>();
const lateByPersona = new Map<string, number>();
const earlyEnd = START.getTime() + 7 * 86_400_000;
const lateStart = START.getTime() + 23 * 86_400_000;

for (const e of events) {
  if (e.kind !== "usage.session") continue;
  const t = new Date(e.timestamp).getTime();
  const persona = personaByUser.get(e.user_id);
  if (!persona) continue;
  if (t < earlyEnd) {
    earlyByPersona.set(persona, (earlyByPersona.get(persona) ?? 0) + 1);
  }
  if (t >= lateStart) {
    lateByPersona.set(persona, (lateByPersona.get(persona) ?? 0) + 1);
  }
}
const trendTable = [...personaCounts.keys()]
  .map((p) => {
    const early = earlyByPersona.get(p) ?? 0;
    const late = lateByPersona.get(p) ?? 0;
    const ratio = early === 0 ? 0 : late / early;
    return `  ${p.padEnd(20)} early=${early.toString().padStart(5)}  late=${late.toString().padStart(5)}  late/early=${ratio.toFixed(2)}`;
  })
  .join("\n");
console.log(trendTable);

console.log("\n--- 5. Sample timeline (first user of each persona) ---");
const sampledPersonas = new Set<string>();
for (const g of src.ground_truth) {
  if (sampledPersonas.has(g.persona)) continue;
  sampledPersonas.add(g.persona);
  const tl = timelines.find((t) => t.user_id === g.user_id);
  if (!tl) continue;
  console.log(
    `\n  user_id=${tl.user_id}  persona=${g.persona}  will_churn=${g.will_churn}${g.churn_at ? `  churn_at=${g.churn_at.slice(0, 10)}` : ""}`
  );
  const counts = new Map<string, number>();
  for (const e of tl.events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`)
    .join(", ");
  console.log(`    events: ${summary}`);
}

console.log("\n--- 6. Average risk score per persona (heuristic only, useLLM=false) ---");
const scores = await scoreAll(timelines, { useLLM: false });
const scoreByUser = new Map(scores.map((s) => [s.user_id, s.score]));

const ADVERSARIAL = new Set(["re_engager", "crashy_loyal", "silent_lurker"]);
const TRUE_CHURNERS = new Set(["lapsing", "wavering", "free_rider"]);

type Bucket = { sum: number; n: number; sumChurned: number; nChurned: number };
const personaScoreSums = new Map<string, Bucket>();
for (const g of src.ground_truth) {
  const s = scoreByUser.get(g.user_id);
  if (s === undefined) continue;
  const cur = personaScoreSums.get(g.persona) ?? { sum: 0, n: 0, sumChurned: 0, nChurned: 0 };
  cur.sum += s;
  cur.n += 1;
  if (g.will_churn) {
    cur.sumChurned += s;
    cur.nChurned += 1;
  }
  personaScoreSums.set(g.persona, cur);
}
const scoreTable = [...personaScoreSums.entries()]
  .sort((a, b) => b[1].sum / b[1].n - a[1].sum / a[1].n)
  .map(([name, s]) => {
    const avg = s.sum / s.n;
    const churnedAvg = s.nChurned > 0 ? s.sumChurned / s.nChurned : 0;
    const tag = ADVERSARIAL.has(name)
      ? "  [adversarial — avg should be < 0.4]"
      : TRUE_CHURNERS.has(name)
      ? "  [true churner — churned-only avg should be ≥ 0.5]"
      : "";
    return `  ${name.padEnd(20)} avg=${avg.toFixed(3)}  churned_avg=${churnedAvg.toFixed(3)}  n=${s.n} (${s.nChurned} churned)${tag}`;
  })
  .join("\n");
console.log(scoreTable);

const failures: string[] = [];
for (const [name, s] of personaScoreSums) {
  const avg = s.sum / s.n;
  if (ADVERSARIAL.has(name) && avg >= 0.4) {
    failures.push(`  ✗ ${name}: avg=${avg.toFixed(3)} ≥ 0.4 (expected < 0.4)`);
  }
  if (TRUE_CHURNERS.has(name) && s.nChurned > 0) {
    const cAvg = s.sumChurned / s.nChurned;
    if (cAvg < 0.5) {
      failures.push(`  ✗ ${name}: churned_avg=${cAvg.toFixed(3)} < 0.5 (expected ≥ 0.5)`);
    }
  }
}
if (failures.length === 0) {
  console.log("\n  ✓ all adversarial personas avg < 0.4 and all true churners' churned-avg ≥ 0.5");
} else {
  console.log("\n  Status:");
  console.log(failures.join("\n"));
  console.log(
    "\n  Note: with 30-day windows the true-churner ≥0.5 bar is not reachable" +
      "\n  without pushing adversarial silent_lurker above 0.4 (both look low-usage)." +
      "\n  This is the honest baseline — see scripts/inspect.ts and SPEC notes."
  );
}

console.log("\n=== done ===\n");
