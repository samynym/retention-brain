import { generateObject } from "ai";
import { z } from "zod";
import { getModel, type Channel } from "@rcrb/core";
import type { RiskScore } from "@rcrb/risk-engine";
import type { OfferDecision } from "./decide-offer.js";
import { formatTopSignals } from "./prompts.js";

const Schema = z.object({
  subject: z.string().max(80).optional(),
  body: z.string().max(800),
});

export type ComposedCopy = z.infer<typeof Schema>;

const CHANNEL_RULES: Record<Channel, string> = {
  email: "Email: subject ≤80 chars, body warm and specific.",
  push: "Push: ≤80 chars body, no subject. Concise and human.",
  in_app: "In-app: short, conversational, fits in a small surface.",
  dunning_fix: "Dunning fix: clear about the payment issue and how to resolve it.",
  no_op: "",
};

export async function compose(args: {
  risk: RiskScore;
  channel: Channel;
  offer: OfferDecision;
  user_email?: string;
}): Promise<ComposedCopy> {
  const { risk, channel, offer, user_email } = args;

  const offerLine =
    offer.kind === "none"
      ? "No offer — focus on understanding, help, or value reminder."
      : `Offer: ${offer.kind}${offer.value !== undefined ? ` value=${offer.value}` : ""} (${offer.reason})`;

  const wantsSubject = channel === "email" || channel === "dunning_fix";

  const { object } = await generateObject({
    model: getModel("creative"),
    schema: Schema,
    system:
      "You write retention copy that is warm, specific, and not desperate. " +
      "Mention the actual signal so it feels personal — not a template. " +
      "No emojis unless absolutely natural. No clickbait subjects.",
    prompt:
      `User: ${risk.user_id}${user_email ? ` (${user_email})` : ""}\n` +
      `Risk score: ${risk.score.toFixed(2)}\n` +
      `Channel: ${channel}\n` +
      `${offerLine}\n` +
      `Narrative: ${risk.narrative}\n` +
      `Top signals:\n${formatTopSignals(risk)}\n\n` +
      `${CHANNEL_RULES[channel]}\n` +
      `Write the copy now. ${wantsSubject ? "Include a subject." : "Omit subject."}`,
  });
  return object;
}
