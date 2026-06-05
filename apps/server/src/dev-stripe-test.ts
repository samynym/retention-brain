import "dotenv/config";
import { analyze } from "./analyze.js";
import { stripeSource } from "./sources/stripe.js";

/**
 * Proves the real Stripe → events → briefing path on the seeded test-mode data.
 *   pnpm --filter @retention-brain/server exec tsx src/dev-stripe-test.ts
 */
const key = process.env.STRIPE_TEST_KEY ?? "";
if (!key.startsWith("sk_test_")) throw new Error("STRIPE_TEST_KEY must be sk_test_.");

async function main() {
  const src = stripeSource(key, "stripe-test");

  // show the raw events the adapter produces
  const events = [];
  const now = new Date();
  const since = new Date(now.getTime() - 60 * 86400000);
  for await (const e of src.backfill({ since, until: now })) events.push(e);
  console.log(`adapter produced ${events.length} events:`);
  for (const e of events) {
    console.log(`  ${e.timestamp.slice(0, 10)}  ${e.kind.padEnd(22)} ${e.payload.email ?? e.user_id}`);
  }

  console.log("\nrunning analyze (heuristic scoring, threshold 0.3)…");
  const briefing = await analyze([stripeSource(key, "stripe-test")], {
    now,
    threshold: 0.3,
    scoreUseLLM: false,
    draftInterventions: false,
  });
  console.log(`account: ${JSON.stringify(briefing.account)}`);
  for (const u of briefing.users) {
    console.log(
      `  ${u.email ?? u.user_id}  risk ${u.risk.score.toFixed(2)}  top: ${u.risk.top_signals[0]?.name ?? "—"}`,
    );
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
