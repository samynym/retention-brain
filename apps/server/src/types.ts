import type { Intervention } from "@retention-brain/core";
import type { RiskScore } from "@retention-brain/risk-engine";

/**
 * The briefing shape the API returns and the frontend renders. Built from the
 * real engine output (RiskScore + Intervention from packages/), joined with the
 * user's event timeline as evidence. This is the real counterpart to the
 * mockup's `MockBriefing`.
 */

export type EvidenceEvent = {
  timestamp: string;
  /** an EventKind, e.g. "payment.failure" */
  kind: string;
  /** short human summary of the event payload, if any */
  detail?: string;
};

export type BriefingUser = {
  user_id: string;
  email: string | null;
  risk: RiskScore;
  /** null when the agent recommended no_op or the user fell outside the top-N */
  intervention: Intervention | null;
  events: EvidenceEvent[];
};

export type Briefing = {
  generated_at: string;
  cutoff_iso: string;
  account: {
    total_users: number;
    flagged: number;
    high: number;
    medium: number;
  };
  /** flagged users, sorted by risk descending */
  users: BriefingUser[];
  /** sources that failed this run (skipped, not fatal) */
  warnings?: { source: string; error: string }[];
};
