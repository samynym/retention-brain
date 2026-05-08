import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { UserTimeline } from "@rcrb/core";
import type { RiskScore } from "@rcrb/risk-engine";

const Schema = z.object({
  channel: z.enum(["email", "push", "in_app", "dunning_fix", "no_op"]),
  reason: z.string().max(140),
});

export type ChannelDecision = z.infer<typeof Schema>;

const MODEL_ID = "claude-sonnet-4-6";

export async function decideChannel(
  risk: RiskScore,
  _timeline: UserTimeline
): Promise<ChannelDecision> {
  const topReasons = risk.top_signals
    .map((s) => `- ${s.name} (score=${s.score.toFixed(2)}): ${s.reason}`)
    .join("\n");

  const { object } = await generateObject({
    model: anthropic(MODEL_ID),
    schema: Schema,
    system:
      "You pick the right outreach channel for an at-risk subscription user. " +
      "Be calibrated. If the user is not clearly at risk, pick no_op.",
    prompt:
      `User: ${risk.user_id}\n` +
      `Risk score: ${risk.score.toFixed(2)}\n` +
      `Narrative: ${risk.narrative}\n` +
      `Top signals:\n${topReasons}\n\n` +
      `Channel guidance:\n` +
      `- email: explanations, longer messages, confirmations\n` +
      `- push: brief nudge, only if user has been engaged recently\n` +
      `- in_app: only if user is currently active in the app\n` +
      `- dunning_fix: only if the primary signal is payment_health\n` +
      `- no_op: low risk, or signals too noisy to act on\n\n` +
      `Pick exactly one channel. Reason ≤140 chars.`,
  });
  return object;
}
