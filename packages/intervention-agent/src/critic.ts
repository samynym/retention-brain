import { generateObject } from "ai";
import { z } from "zod";
import { getModel, getModelId, type Intervention } from "@retention-brain/core";

const CriticSchema = z.object({
  scores: z.object({
    relevance: z.number().min(1).max(5),
    personalization: z.number().min(1).max(5),
    tone: z.number().min(1).max(5),
    plausibility: z.number().min(1).max(5),
  }),
  // GPT-4o regularly returns critique notes in the 300-500 char range when it has
  // multiple dimensions of feedback. 280 was too tight and caused silent critic
  // failures (the parent run.ts catches and logs but the critique field stays
  // empty in the briefing). 800 leaves headroom without inviting essay-length.
  notes: z.string().max(800),
  recommendation: z.enum(["accept", "revise", "reject"]),
});

export type Critique = z.infer<typeof CriticSchema>;

export async function critique(
  intervention: Intervention,
  opts: { model?: string } = {}
): Promise<Critique> {
  const modelId = opts.model ?? getModelId("critic");
  const offerLine =
    intervention.offer.kind === "none"
      ? "none"
      : `${intervention.offer.kind}${intervention.offer.value !== undefined ? ` value=${intervention.offer.value}` : ""}`;

  const { object } = await generateObject({
    model: getModel(modelId),
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
