import type { Persona } from "./types.js";

export const loyal: Persona = {
  name: "loyal",
  weight: 0.30,
  profile: {
    sessions_per_week: { mean: 12, sd: 3 },
    feature_events_per_session: { mean: 8, sd: 2 },
    payment_failure_rate: 0.02,
    support_ticket_rate: 0.05,
    crash_rate: 0.01,
    will_churn: false,
    churn_window_days: null,
    churn_reason: null,
    sessions_trend: 1.0,
  },
};
