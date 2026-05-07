import type { Persona } from "./types.js";

export const lapsed_returning: Persona = {
  name: "lapsed_returning",
  weight: 0.05,
  profile: {
    sessions_per_week: { mean: 2, sd: 1 },
    feature_events_per_session: { mean: 3, sd: 2 },
    payment_failure_rate: 0.03,
    support_ticket_rate: 0.10,
    crash_rate: 0.02,
    will_churn: false,
    churn_window_days: null,
    churn_reason: null,
    sessions_trend: 1.5, // recovering — by end of window, sessions are ~150% of start
  },
};
