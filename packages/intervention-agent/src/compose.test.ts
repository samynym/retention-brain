import { describe, it, expect } from "vitest";
import type { RiskScore } from "@rcrb/risk-engine";
import { compose } from "./compose.js";

const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

const baseRisk: RiskScore = {
  user_id: "user_test",
  score: 0.85,
  top_signals: [
    {
      name: "usage_decline",
      score: 0.8,
      weight: 0.35,
      reason: "Sessions dropped 80% in last 7 days.",
    },
    {
      name: "engagement_recency",
      score: 0.6,
      weight: 0.35,
      reason: "Last session 9 days ago.",
    },
  ],
  narrative: "Engaged user who suddenly went quiet.",
  llm_judge_available: true,
};

describe.skipIf(!HAS_KEY)("compose (live LLM)", () => {
  it("produces a subject AND body for email channel within length limits", async () => {
    const copy = await compose({
      risk: baseRisk,
      channel: "email",
      offer: { kind: "discount_percent", value: 20, reason: "wavering paying user" },
      user_email: "test@example.test",
    });
    expect(copy.body.length).toBeGreaterThan(20);
    expect(copy.body.length).toBeLessThanOrEqual(800);
    expect(copy.subject).toBeDefined();
    expect(copy.subject!.length).toBeGreaterThan(0);
    expect(copy.subject!.length).toBeLessThanOrEqual(80);
  }, 90_000);

  it("produces no meaningful subject for push channel", async () => {
    const copy = await compose({
      risk: baseRisk,
      channel: "push",
      offer: { kind: "none", reason: "low-stakes nudge" },
    });
    expect(copy.body.length).toBeGreaterThan(0);
    expect(copy.body.length).toBeLessThanOrEqual(800);
    // We instruct the model to omit subject for push. The schema makes subject
    // optional, so the model may legitimately return either undefined OR an
    // empty string. Both are equivalent "no subject" responses — assert that
    // the model didn't generate a real subject line.
    const hasMeaningfulSubject =
      copy.subject !== undefined && copy.subject !== null && copy.subject.trim().length > 0;
    expect(hasMeaningfulSubject).toBe(false);
  }, 90_000);
});
