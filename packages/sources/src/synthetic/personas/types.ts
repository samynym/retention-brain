export type ChurnReason =
  | "usage_decline"
  | "payment_failure"
  | "support_complaint"
  | "crash_storm";

/**
 * "linear": sessions_trend is the end-of-window multiplier — interpolated linearly from 1.0 at d=0.
 * "rebound": sessions_trend is the *minimum* multiplier reached at the midpoint, then rebounds to ~1.5 at the end.
 */
export type TrendProfile = "linear" | "rebound";

export type Persona = {
  name: string;
  weight: number;
  profile: {
    sessions_per_week: { mean: number; sd: number };
    feature_events_per_session: { mean: number; sd: number };
    payment_failure_rate: number;
    support_ticket_rate: number;
    crash_rate: number;
    will_churn: boolean;
    churn_window_days: number | null;
    churn_reason: ChurnReason | null;
    /** Daily session-rate trend: 1.0 = flat, <1 = declining, >1 = rising */
    sessions_trend: number;
    trend_profile?: TrendProfile;
  };
};
