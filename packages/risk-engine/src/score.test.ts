import { describe, it, expect } from "vitest";
import { syntheticSource } from "@retention-brain/sources/synthetic";
import { buildTimelines, type Event } from "@retention-brain/core";
import { scoreAll, EVAL_SEEDS } from "./index.js";

// Held-out seed (eval-fixed-2). Bars are pre-registered at fixed thresholds —
// no median-of-churners trick. Numbers below are observed post-adversarial
// (10 personas including 3 adversarials), heuristic-only:
//   lapsing mean ≈ 0.43, loyal mean ≈ 0.07, delta ≈ 0.36
//   threshold 0.4: precision ≈ 0.71, recall ≈ 0.76
//   threshold 0.5: precision ≈ 0.71, recall ≈ 0.75
describe("risk engine — heuristic only (held-out seed, pre-registered)", () => {
  it("flags lapsing users at materially higher risk than loyal", async () => {
    const src = syntheticSource({
      num_users: 1000,
      days: 30,
      seed: EVAL_SEEDS[1],
      start_date: new Date("2026-01-01T00:00:00.000Z"),
    });
    const events: Event[] = [];
    for await (const e of src.backfill({
      since: new Date("2025-11-01"),
      until: new Date("2026-02-01"),
    })) {
      events.push(e);
    }
    const timelines = buildTimelines(events);
    const scores = await scoreAll(timelines, { useLLM: false });
    const byUser = new Map(scores.map((s) => [s.user_id, s]));

    const lapsing = src.ground_truth
      .filter((g) => g.persona === "lapsing")
      .map((g) => byUser.get(g.user_id)!.score);
    const loyal = src.ground_truth
      .filter((g) => g.persona === "loyal")
      .map((g) => byUser.get(g.user_id)!.score);
    const lapsingMean = lapsing.reduce((s, x) => s + x, 0) / lapsing.length;
    const loyalMean = loyal.reduce((s, x) => s + x, 0) / loyal.length;
    expect(lapsingMean - loyalMean).toBeGreaterThanOrEqual(0.25);
  });

  it("hits precision/recall floors at the operating threshold (0.4) on a held-out seed", async () => {
    const src = syntheticSource({
      num_users: 1000,
      days: 30,
      seed: EVAL_SEEDS[1],
      start_date: new Date("2026-01-01T00:00:00.000Z"),
    });
    const events: Event[] = [];
    for await (const e of src.backfill({
      since: new Date("2025-11-01"),
      until: new Date("2026-02-01"),
    })) {
      events.push(e);
    }
    const timelines = buildTimelines(events);
    const scores = await scoreAll(timelines, { useLLM: false });
    const byUser = new Map(scores.map((s) => [s.user_id, s]));

    const churners = src.ground_truth.filter((g) => g.will_churn);
    const churnerSet = new Set(churners.map((g) => g.user_id));

    for (const threshold of [0.4, 0.5, 0.6] as const) {
      const flagged = scores.filter((s) => s.score >= threshold);
      const tp = flagged.filter((s) => churnerSet.has(s.user_id)).length;
      const precision = flagged.length === 0 ? 0 : tp / flagged.length;
      const recall = churnerSet.size === 0 ? 0 : tp / churnerSet.size;
      // Informational — lets future regressions show up in test output.
      console.log(`  threshold=${threshold} flagged=${flagged.length} precision=${precision.toFixed(3)} recall=${recall.toFixed(3)}`);
    }

    const flagged = scores.filter((s) => s.score >= 0.4);
    const tp = flagged.filter((s) => churnerSet.has(s.user_id)).length;
    const precision = tp / flagged.length;
    const recall = tp / churnerSet.size;
    expect(precision).toBeGreaterThanOrEqual(0.65);
    expect(recall).toBeGreaterThanOrEqual(0.70);

    // also covers user_id resolution — every churner must be in the score map
    for (const c of churners) expect(byUser.get(c.user_id)).toBeDefined();
  });
});
