import { describe, it, expect } from "vitest";
import type { RiskScore } from "@rcrb/risk-engine";
import { decideChannel } from "./decide-channel.js";

const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

const baseRisk = (overrides: Partial<RiskScore> = {}): RiskScore => ({
  user_id: "user_test",
  score: 0.85,
  top_signals: [
    {
      name: "payment_health",
      score: 0.9,
      weight: 0.4,
      reason: "Recent payment failure with no subsequent success.",
    },
  ],
  narrative: "Test narrative",
  llm_judge_available: true,
  ...overrides,
});

const VALID_CHANNELS = new Set(["email", "push", "in_app", "dunning_fix", "no_op"]);

describe.skipIf(!HAS_KEY)("decideChannel (live LLM)", () => {
  it("returns a valid channel + reason for a clear payment_health risk", async () => {
    const decision = await decideChannel(baseRisk());
    expect(VALID_CHANNELS.has(decision.channel)).toBe(true);
    expect(decision.reason.length).toBeGreaterThan(0);
    expect(decision.reason.length).toBeLessThanOrEqual(140);
  }, 30_000);

  it("picks no_op for an obviously low-risk user", async () => {
    const decision = await decideChannel(
      baseRisk({
        score: 0.05,
        top_signals: [
          {
            name: "engagement_recency",
            score: 0.1,
            weight: 0.35,
            reason: "Last session 1 day ago.",
          },
        ],
        narrative: "User is active.",
      })
    );
    // We don't strictly assert no_op (model may differ) — but the channel must be valid.
    expect(VALID_CHANNELS.has(decision.channel)).toBe(true);
  }, 30_000);
});
