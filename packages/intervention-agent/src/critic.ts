import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import type { Intervention } from "@rcrb/core";

const CriticSchema = z.object({
  scores: z.object({
    relevance: z.number().min(1).max(5),
    personalization: z.number().min(1).max(5),
    tone: z.number().min(1).max(5),
    plausibility: z.number().min(1).max(5),
  }),
  notes: z.string().max(280),
  recommendation: z.enum(["accept", "revise", "reject"]),
});

export type Critique = z.infer<typeof CriticSchema>;

const MODEL_ID = "claude-sonnet-4-6";

export async function critique(intervention: Intervention): Promise<Critique> {
  const offerLine =
    intervention.offer.kind === "none"
      ? "none"
      : `${intervention.offer.kind}${intervention.offer.value !== undefined ? ` value=${intervention.offer.value}` : ""}`;

  const { object } = await generateObject({
    model: anthropic(MODEL_ID),
    schema: CriticSchema,
    system:
      "You are a senior retention PM reviewing a generated intervention. " +
      "Score 1-5 across four dimensions and recommend accept (avg ≥4), revise (3–3.99), or reject (<3).",
    prompt:
      `User: ${intervention.user_id}\n` +
      `Risk score: ${intervention.risk_score.toFixed(2)}\n` +
      `Channel: ${intervention.channel}\n` +
      `Offer: ${offerLine}\n` +
      `Timing: ${intervention.timing}\n` +
      `Subject: ${intervention.copy.subject ?? "(none)"}\n` +
      `Body:\n${intervention.copy.body}\n\n` +
      `Reasoning:\n${intervention.reasoning}\n\n` +
      `Score on:\n` +
      `- relevance: matches actual risk signals?\n` +
      `- personalization: reflects this user, not template?\n` +
      `- tone: warm, specific, not desperate?\n` +
      `- plausibility: would a thoughtful PM actually send this?`,
  });
  return object;
}
