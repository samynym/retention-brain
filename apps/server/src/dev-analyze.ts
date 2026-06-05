import "dotenv/config";
import { fileURLToPath } from "node:url";
import { hasLLMKey } from "@retention-brain/core";
import { analyze } from "./analyze.js";
import { fixtureSource } from "./sources/fixture.js";

/**
 * Local proof that the real engine produces a real briefing through the server
 * pipeline. Cheap by design: heuristic-only scoring (no per-user LLM judge) and
 * a hard cap of 3 LLM-drafted interventions. Run from anywhere:
 *   pnpm --filter @retention-brain/server analyze:dev
 */

const eventsFile = fileURLToPath(
  new URL("../../../examples/synthetic-events.jsonl", import.meta.url),
);

const CUTOFF = new Date("2026-05-08T00:00:00.000Z"); // matches the sample dataset window

async function main() {
  console.log(`LLM key present: ${hasLLMKey()}`);
  console.log("Running analyze on the synthetic dataset (cheap mode)...\n");
  const t0 = Date.now();

  const briefing = await analyze([fixtureSource(eventsFile, "synthetic")], {
    now: CUTOFF,
    threshold: 0.4,
    scoreUseLLM: false, // skip 80 judge calls — heuristic scoring only
    draftInterventions: true,
    maxInterventions: 3, // cap LLM cost for the smoke test
  });

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const { account } = briefing;
  console.log(
    `account: ${account.total_users} users · ${account.flagged} flagged · ` +
      `${account.high} high · ${account.medium} medium  (${secs}s)\n`,
  );

  const drafted = briefing.users.filter((u) => u.intervention);
  console.log(`top flagged (showing up to 5):`);
  for (const u of briefing.users.slice(0, 5)) {
    console.log(
      `  ${u.email ?? u.user_id}  risk ${u.risk.score.toFixed(2)}  ` +
        `top: ${u.risk.top_signals[0]?.name ?? "—"}  ` +
        `events: ${u.events.length}`,
    );
  }

  console.log(`\ndrafted interventions: ${drafted.length}`);
  for (const u of drafted) {
    const iv = u.intervention!;
    console.log(`\n— ${u.email ?? u.user_id} · risk ${u.risk.score.toFixed(2)}`);
    console.log(`  play: ${iv.channel} · ${iv.offer.kind}${iv.offer.value ? `=${iv.offer.value}` : ""} · ${iv.timing}`);
    console.log(`  subject: ${iv.copy.subject ?? "(none)"}`);
    console.log(`  body: ${iv.copy.body.slice(0, 120).replace(/\n/g, " ")}…`);
    if (iv.critique) console.log(`  critic: ${iv.critique.recommendation}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
