import { z } from "zod";

export const Channel = z.enum([
  "email",
  "push",
  "in_app",
  "dunning_fix",
  "no_op",
]);
export type Channel = z.infer<typeof Channel>;

export const OfferKind = z.enum([
  "discount_percent",
  "discount_amount",
  "extension_days",
  "upgrade_incentive",
  "feature_unlock",
  "none",
]);
export type OfferKind = z.infer<typeof OfferKind>;

export const Timing = z.enum([
  "immediate",
  "next_session",
  "within_24h",
  "before_renewal",
]);
export type Timing = z.infer<typeof Timing>;

export const InterventionCritique = z.object({
  scores: z.object({
    relevance: z.number().min(1).max(5),
    personalization: z.number().min(1).max(5),
    tone: z.number().min(1).max(5),
    plausibility: z.number().min(1).max(5),
  }),
  notes: z.string(),
  recommendation: z.enum(["accept", "revise", "reject"]),
});
export type InterventionCritique = z.infer<typeof InterventionCritique>;

export const Intervention = z.object({
  user_id: z.string(),
  risk_score: z.number().min(0).max(1),
  channel: Channel,
  offer: z.object({
    kind: OfferKind,
    value: z.number().optional(),
  }),
  timing: Timing,
  copy: z.object({
    subject: z.string().optional(),
    body: z.string(),
  }),
  reasoning: z.string(),
  predicted_lift: z.object({
    direction: z.enum(["positive", "neutral", "negative"]),
    confidence: z.enum(["low", "medium", "high"]),
    note: z.string(),
  }),
  critique: InterventionCritique.optional(),
});
export type Intervention = z.infer<typeof Intervention>;
