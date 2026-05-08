import type { Persona } from "./types.js";

export const re_engager: Persona = {
  name: "re_engager",
  weight: 0.05,
  profile: {
    sessions_per_week: { mean: 8, sd: 2 },
    feature_events_per_session: { mean: 5, sd: 2 },
    payment_failure_rate: 0.02,
    support_ticket_rate: 0.05,
    crash_rate: 0.02,
    will_churn: false,
    churn_window_days: null,
    churn_reason: null,
    sessions_trend: 0.3,
    trend_profile: "rebound",
  },
};
