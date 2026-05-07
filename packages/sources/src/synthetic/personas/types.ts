export type ChurnReason =
  | "usage_decline"
  | "payment_failure"
  | "support_complaint"
  | "crash_storm";

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
  };
};
