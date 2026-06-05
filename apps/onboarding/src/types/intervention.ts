/**
 * Mirrors @retention-brain/core schemas verbatim. Kept as pure TS (no zod)
 * because the mockup has no runtime validation needs — the only goal is that
 * fixtures conform to the same shape so the UI is wired to the real schema.
 */

export type Channel =
  | "email"
  | "push"
  | "in_app"
  | "dunning_fix"
  | "no_op";

export type OfferKind =
  | "discount_percent"
  | "discount_amount"
  | "extension_days"
  | "upgrade_incentive"
  | "feature_unlock"
  | "none";

export type Timing =
  | "immediate"
  | "next_session"
  | "within_24h"
  | "before_renewal";

export type InterventionCritique = {
  scores: {
    relevance: number;
    personalization: number;
    tone: number;
    plausibility: number;
  };
  notes: string;
  recommendation: "accept" | "revise" | "reject";
};

export type Intervention = {
  user_id: string;
  risk_score: number;
  channel: Channel;
  offer: {
    kind: OfferKind;
    value?: number;
  };
  timing: Timing;
  copy: {
    subject?: string;
    body: string;
  };
  reasoning: string;
  predicted_lift: {
    direction: "positive" | "neutral" | "negative";
    confidence: "low" | "medium" | "high";
    note: string;
  };
  critique?: InterventionCritique;
};

export type Signal = {
  name: string;
  score: number;
  weight: number;
  reason: string;
};

export type RiskScore = {
  user_id: string;
  score: number;
  top_signals: Signal[];
  narrative: string;
  llm_judge_available: boolean;
};

/**
 * Mockup-only convenience type: pairs the RiskScore (the "why") with the
 * Intervention (the "what to send"), the way the briefing renderer joins them.
 */
export type UserBriefing = {
  email: string;
  risk: RiskScore;
  intervention: Intervention;
};
