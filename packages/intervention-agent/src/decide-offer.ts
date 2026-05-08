import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { Channel } from "@rcrb/core";
import type { RiskScore } from "@rcrb/risk-engine";

const Schema = z.object({
  kind: z.enum([
    "discount_percent",
    "discount_amount",
    "extension_days",
    "upgrade_incentive",
    "feature_unlock",
    "none",
  ]),
  value: z.number().optional(),
  reason: z.string().max(140),
});

export type OfferDecision = z.infer<typeof Schema>;

const MODEL_ID = "claude-sonnet-4-6";

export async function decideOffer(
  risk: RiskScore,
  channel: Channel
): Promise<OfferDecision> {
  const topReasons = risk.top_signals
    .map((s) => `- ${s.name} (score=${s.score.toFixed(2)}): ${s.reason}`)
    .join("\n");

  const { object } = await generateObject({
    model: anthropic(MODEL_ID),
    schema: Schema,
    system:
      "You pick a calibrated retention offer for an at-risk subscription user. " +
      "Not every at-risk user needs a discount. Sometimes the right offer is none.",
    prompt:
      `User: ${risk.user_id}\n` +
      `Risk score: ${risk.score.toFixed(2)}\n` +
      `Channel: ${channel}\n` +
      `Narrative: ${risk.narrative}\n` +
      `Top signals:\n${topReasons}\n\n` +
      `Offer guidance:\n` +
      `- discount_percent: 10–25 typical; for usage_decline or post-trial\n` +
      `- discount_amount: a flat-amount discount when % doesn't fit\n` +
      `- extension_days: 7–30 typical; best for payment_health failures\n` +
      `- upgrade_incentive: only for power users showing volume frustration\n` +
      `- feature_unlock: time-limited free pro features\n` +
      `- none: user just needs help/reassurance, not a bribe\n\n` +
      `Pick exactly one offer. Include numeric value when relevant. Reason ≤140 chars.`,
  });
  return object;
}
