import type { Persona } from "./types.js";

export const wavering: Persona = {
  name: "wavering",
  weight: 0.20,
  profile: {
    sessions_per_week: { mean: 4, sd: 2 },
    feature_events_per_session: { mean: 4, sd: 2 },
    payment_failure_rate: 0.04,
    support_ticket_rate: 0.20,
    crash_rate: 0.03,
    will_churn: true,
    churn_window_days: 21,
    churn_reason: "usage_decline",
    sessions_trend: 0.4,
  },
};
