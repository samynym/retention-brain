import type { Intervention, RiskScore } from "./intervention";

/**
 * Mirrors apps/server/src/types.ts — the real briefing the backend returns.
 * Kept as plain TS (the API sends JSON matching these shapes). The UI renders
 * either these (live) or the local fixtures (design preview).
 */

export type EvidenceEvent = {
  timestamp: string;
  kind: string;
  detail?: string;
};

export type BriefingUser = {
  user_id: string;
  email: string | null;
  risk: RiskScore;
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
  users: BriefingUser[];
  /** sources that failed this run (skipped, not fatal) */
  warnings?: { source: string; error: string }[];
};

/**
 * The shape a UserCard renders — common to a live `BriefingUser` (no archetype,
 * intervention may be null) and a fixture `MockBriefing` (archetype present,
 * intervention always set). Lets one card render both.
 */
export type CardUser = {
  user_id: string;
  email: string | null;
  archetype?: string;
  risk: RiskScore;
  intervention: Intervention | null;
  events: EvidenceEvent[];
};
