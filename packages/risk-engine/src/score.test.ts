import { describe, it, expect } from "vitest";
import { syntheticSource } from "@rcrb/sources/synthetic";
import { buildTimelines, type Event } from "@rcrb/core";
import { scoreAll } from "./index.js";

describe("risk engine — heuristic only", () => {
  it("flags lapsing users at higher risk than loyal", async () => {
    const src = syntheticSource({ num_users: 200, days: 30, seed: "risk-test", start_date: new Date("2026-01-01T00:00:00.000Z") });
    const events: Event[] = [];
    for await (const e of src.backfill({ since: new Date("2025-11-01"), until: new Date("2026-02-01") })) events.push(e);
    const timelines = buildTimelines(events);
    const scores = await scoreAll(timelines, { useLLM: false });
    const byUser = new Map(scores.map((s) => [s.user_id, s]));

    const lapsing = src.ground_truth.filter((g) => g.persona === "lapsing").map((g) => byUser.get(g.user_id)!.score);
    const loyal = src.ground_truth.filter((g) => g.persona === "loyal").map((g) => byUser.get(g.user_id)!.score);
    const lapsingMean = lapsing.reduce((s, x) => s + x, 0) / lapsing.length;
    const loyalMean = loyal.reduce((s, x) => s + x, 0) / loyal.length;
    expect(lapsingMean).toBeGreaterThan(loyalMean + 0.2);
  });

  it("achieves >=75% precision @ 50% recall on synthetic churners", async () => {
    const src = syntheticSource({ num_users: 1000, days: 30, seed: "precision-test", start_date: new Date("2026-01-01T00:00:00.000Z") });
    const events: Event[] = [];
    for await (const e of src.backfill({ since: new Date("2025-11-01"), until: new Date("2026-02-01") })) events.push(e);
    const timelines = buildTimelines(events);
    const scores = await scoreAll(timelines, { useLLM: false });
    const byUser = new Map(scores.map((s) => [s.user_id, s]));

    const churners = src.ground_truth.filter((g) => g.will_churn);
    const churnerScores = churners.map((g) => byUser.get(g.user_id)!.score).sort((a, b) => b - a);
    const threshold = churnerScores[Math.floor(churners.length * 0.5)]!;
    const flagged = scores.filter((s) => s.score >= threshold);
    const churnerSet = new Set(churners.map((g) => g.user_id));
    const truePositives = flagged.filter((s) => churnerSet.has(s.user_id)).length;
    const precision = truePositives / flagged.length;
    expect(precision).toBeGreaterThanOrEqual(0.75);
  });
});
