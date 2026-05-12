import { describe, it, expect } from "vitest";
import type { Intervention } from "@rcrb/core";
import { critique } from "./critic.js";

const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

const VALID_RECOMMENDATIONS = new Set(["accept", "revise", "reject"]);

const sampleIntervention: Intervention = {
  user_id: "user_test",
  risk_score: 0.85,
  channel: "email",
  offer: { kind: "discount_percent", value: 20 },
  timing: "within_24h",
  copy: {
    subject: "We noticed things went quiet — here's 20% off",
    body:
      "Hi there,\n\nWe noticed you haven't logged in for about a week. Your usage went from a few sessions a week to zero — and we want to make it easy to come back. Here's 20% off your next month.\n\nIf something specific got in the way, hit reply and let me know.\n\n— The team",
  },
  reasoning:
    "channel: usage drop calls for personal email | offer: small discount for wavering paying user | timing: send during work hours when they may check email",
  predicted_lift: {
    direction: "positive",
    confidence: "low",
    note: "directional only — no historical baseline",
  },
};

describe.skipIf(!HAS_KEY)("critique (live LLM)", () => {
  it("returns a structured critique with scores in [1,5] and a valid recommendation", async () => {
    const review = await critique(sampleIntervention);
    for (const dim of ["relevance", "personalization", "tone", "plausibility"] as const) {
      expect(review.scores[dim]).toBeGreaterThanOrEqual(1);
      expect(review.scores[dim]).toBeLessThanOrEqual(5);
    }
    expect(VALID_RECOMMENDATIONS.has(review.recommendation)).toBe(true);
    expect(review.notes.length).toBeGreaterThan(0);
    expect(review.notes.length).toBeLessThanOrEqual(800);
  }, 60_000);
});
