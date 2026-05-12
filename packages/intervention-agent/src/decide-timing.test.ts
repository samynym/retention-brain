import { describe, it, expect } from "vitest";
import type { RiskScore } from "@rcrb/risk-engine";
import { decideTiming } from "./decide-timing.js";

const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

const VALID_TIMINGS = new Set([
  "immediate",
  "next_session",
  "within_24h",
  "before_renewal",
]);

const baseRisk: RiskScore = {
  user_id: "user_test",
  score: 0.78,
  top_signals: [
    {
      name: "usage_decline",
      score: 0.8,
      weight: 0.35,
      reason: "Sessions dropped 80% in last 7 days.",
    },
  ],
  narrative: "Usage decline pattern.",
  llm_judge_available: true,
};

describe.skipIf(!HAS_KEY)("decideTiming (live LLM)", () => {
  it("returns a valid timing + reason for usage_decline scenario", async () => {
    const decision = await decideTiming(baseRisk, "email");
    expect(VALID_TIMINGS.has(decision.timing)).toBe(true);
    expect(decision.reason.length).toBeGreaterThan(0);
    expect(decision.reason.length).toBeLessThanOrEqual(140);
  }, 30_000);
});
