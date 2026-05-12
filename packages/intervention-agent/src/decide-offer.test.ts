import { describe, it, expect } from "vitest";
import type { RiskScore } from "@rcrb/risk-engine";
import { decideOffer } from "./decide-offer.js";

const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

const VALID_KINDS = new Set([
  "discount_percent",
  "discount_amount",
  "extension_days",
  "upgrade_incentive",
  "feature_unlock",
  "none",
]);

const baseRisk: RiskScore = {
  user_id: "user_test",
  score: 0.82,
  top_signals: [
    {
      name: "payment_health",
      score: 0.9,
      weight: 0.4,
      reason: "Recent payment failure with no subsequent success.",
    },
  ],
  narrative: "Payment failed; high churn risk.",
  llm_judge_available: true,
};

describe.skipIf(!HAS_KEY)("decideOffer (live LLM)", () => {
  it("returns a valid offer kind + reason for payment-failure scenario", async () => {
    const decision = await decideOffer(baseRisk, "dunning_fix");
    expect(VALID_KINDS.has(decision.kind)).toBe(true);
    expect(decision.reason.length).toBeGreaterThan(0);
    expect(decision.reason.length).toBeLessThanOrEqual(140);
    if (decision.value !== undefined) {
      expect(typeof decision.value).toBe("number");
    }
  }, 30_000);
});
