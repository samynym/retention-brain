import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { MODEL_ID, type Channel } from "@rcrb/core";
import type { RiskScore } from "@rcrb/risk-engine";
import { formatTopSignals } from "./prompts.js";

const Schema = z.object({
  timing: z.enum(["immediate", "next_session", "within_24h", "before_renewal"]),
  reason: z.string().max(140),
});

export type TimingDecision = z.infer<typeof Schema>;

export async function decideTiming(
  risk: RiskScore,
  channel: Channel
): Promise<TimingDecision> {
  const { object } = await generateObject({
    model: anthropic(MODEL_ID),
    schema: Schema,
    system: "You pick when to deliver a retention intervention.",
    prompt:
      `User: ${risk.user_id}\n` +
      `Risk score: ${risk.score.toFixed(2)}\n` +
      `Channel: ${channel}\n` +
      `Narrative: ${risk.narrative}\n` +
      `Top signals:\n${formatTopSignals(risk, { withScore: true })}\n\n` +
      `Timing guidance:\n` +
      `- immediate: send right now\n` +
      `- next_session: wait until user opens the app (in_app or push only)\n` +
      `- within_24h: schedule for a high-engagement window\n` +
      `- before_renewal: align with subscription renewal date\n\n` +
      `Pick exactly one timing. Reason ≤140 chars.`,
  });
  return object;
}
