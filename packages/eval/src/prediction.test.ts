import { describe, it, expect } from "vitest";
import { syntheticSource } from "@rcrb/sources/synthetic";
import { buildTimelines, type Event } from "@rcrb/core";
import { scoreAll } from "@rcrb/risk-engine";
import { evalPredictions } from "./prediction.js";

describe("eval — prediction", () => {
  it("reports precision/recall on synthetic data", async () => {
    const src = syntheticSource({
      num_users: 500,
      days: 30,
      seed: "eval-pred",
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
    // Heuristic-only scores rarely cross 0.5 by design; pick a threshold that
    // exercises real precision/recall while still validating the math.
    // The floors below are sanity checks, not the engine's quality bar
    // (that lives in risk-engine's score.test.ts at 75%/50%).
    const e = evalPredictions(scores, src.ground_truth, 0.4);
    expect(e.precision).toBeGreaterThanOrEqual(0.3);
    expect(e.recall).toBeGreaterThanOrEqual(0.3);
    expect(Object.keys(e.by_persona).length).toBeGreaterThanOrEqual(7);
  });
});
