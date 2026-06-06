import { generateObject } from "ai";
import { z } from "zod";
import { getModel } from "@retention-brain/core";
import type { RiskScore } from "@retention-brain/risk-engine";
import { formatTopSignals } from "./prompts.js";

const Schema = z.object({
  channel: z.enum(["email", "push", "in_app", "dunning_fix", "no_op"]),
  reason: z.string().max(140),
});

export type ChannelDecision = z.infer<typeof Schema>;

export async function decideChannel(risk: RiskScore): Promise<ChannelDecision> {
  const { object } = await generateObject({
    model: getModel("structured"),
    schema: Schema,
    system:
      "You pick the right outreach channel for an at-risk subscription user. " +
      "Bias toward action: any user the risk engine has flagged (which this call has already filtered for) " +
      "deserves a deliberate channel choice. " +
      "Reserve no_op for cases where the signals are genuinely contradictory or where intervention would be counterproductive — " +
      "do NOT pick no_op merely because the risk score is mid-range or because multiple signals are firing softly. " +
      "A user with risk ≥0.5 and 2+ signals firing should almost always get a real channel.",
    prompt:
      `User: ${risk.user_id}\n` +
      `Risk score: ${risk.score.toFixed(2)}\n` +
      `Narrative: ${risk.narrative}\n` +
      `Top signals:\n${formatTopSignals(risk, { withScore: true })}\n\n` +
      `Channel guidance — match the dominant signal:\n` +
      `- dunning_fix: primary signal is payment_health (unrecovered payment failures); needs explanation + fix path\n` +
      `- email: usage_decline / engagement_recency / support_sentiment — most retention scenarios. Longer messages, explanations, offers.\n` +
      `- push: brief nudge, only if user has been engaged recently AND signal is soft (push is intrusive)\n` +
      `- in_app: only if user is currently actively using the app (last session within ~2 days)\n` +
      `- no_op: signals are noisy, contradictory, OR a recent positive signal cancels the risk. Justify why no action is the right action.\n\n` +
      `Pick exactly one channel. Reason ≤140 chars.`,
  });
  return object;
}
