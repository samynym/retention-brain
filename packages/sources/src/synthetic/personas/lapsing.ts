import type { Persona } from "./types.js";

export const lapsing: Persona = {
  name: "lapsing",
  weight: 0.10,
  profile: {
    sessions_per_week: { mean: 1, sd: 1 },
    feature_events_per_session: { mean: 2, sd: 1 },
    payment_failure_rate: 0.05,
    support_ticket_rate: 0.10,
    crash_rate: 0.15,
    will_churn: true,
    churn_window_days: 7,
    churn_reason: "usage_decline",
    sessions_trend: 0.05,
  },
};
