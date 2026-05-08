// Inspect the synthetic simulator output. Run with:
//   pnpm exec tsx scripts/inspect.ts
//
// Prints:
//  1. Persona distribution
//  2. Event counts by kind
//  3. Actual churn rate per persona (vs configured)
//  4. Session activity early vs late window per persona (trend visibility)
//  5. A sample timeline for one user per persona

import { syntheticSource } from "../packages/sources/src/synthetic/index.js";
import { buildTimelines, type Event } from "../packages/core/src/index.js";

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

const events: Event[] = [];
for await (const e of src.backfill({ since: START, until: new Date(START.getTime() + DAYS * 86_400_000) })) {
  events.push(e);
}
const timelines = buildTimelines(events);

// --- 1. Persona distribution ---
console.log("--- 1. Persona distribution ---");
const personaCounts = new Map<string, number>();
for (const g of src.ground_truth) {
  personaCounts.set(g.persona, (personaCounts.get(g.persona) ?? 0) + 1);
}
const personaTable = [...personaCounts.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([name, count]) => `  ${name.padEnd(20)} ${count.toString().padStart(4)}  (${((count / NUM_USERS) * 100).toFixed(1)}%)`)
  .join("\n");
console.log(personaTable);
console.log(`  total                ${NUM_USERS}`);

// --- 2. Event counts by kind ---
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

// --- 3. Actual churn rate per persona ---
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

// --- 4. Session activity early vs late window (trend visibility) ---
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

// --- 5. Sample timeline for one user per persona ---
console.log("\n--- 5. Sample timeline (first user of each persona) ---");
const sampledPersonas = new Set<string>();
for (const g of src.ground_truth) {
  if (sampledPersonas.has(g.persona)) continue;
  sampledPersonas.add(g.persona);
  const tl = timelines.find((t) => t.user_id === g.user_id);
  if (!tl) continue;
  console.log(`\n  user_id=${tl.user_id}  persona=${g.persona}  will_churn=${g.will_churn}${g.churn_at ? `  churn_at=${g.churn_at.slice(0, 10)}` : ""}`);
  const counts = new Map<string, number>();
  for (const e of tl.events) counts.set(e.kind, (counts.get(e.kind) ?? 0) + 1);
  const summary = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([k, n]) => `${k}=${n}`)
    .join(", ");
  console.log(`    events: ${summary}`);
}

console.log("\n=== done ===\n");
