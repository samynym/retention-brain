import { describe, it, expect } from "vitest";
import { syntheticSource } from "@retention-brain/sources/synthetic";
import { buildTimelines, type Event } from "@retention-brain/core";
import { scoreAll } from "@retention-brain/risk-engine";
import { generateAll } from "./run.js";

const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

describe.skipIf(!HAS_KEY)("intervention agent (live LLM)", () => {
  it("generates plausible interventions for top-5 at-risk synthetic users", async () => {
    const src = syntheticSource({
      num_users: 100,
      days: 30,
      seed: "intv-smoke",
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
    const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));
    const risks = await scoreAll(timelines, { useLLM: false });
    const interventions = await generateAll(risks, tlByUser, { threshold: 0.5, max: 5 });

    expect(interventions.length).toBeGreaterThan(0);
    for (const i of interventions) {
      expect(i.copy.body.length).toBeGreaterThan(20);
      expect(i.channel).not.toBe("no_op");
    }
  }, 180_000);
});
