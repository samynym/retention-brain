import type { Persona } from "./types.js";

export const fresh: Persona = {
  name: "fresh",
  weight: 0.15,
  profile: {
    sessions_per_week: { mean: 6, sd: 2 },
    feature_events_per_session: { mean: 5, sd: 2 },
    payment_failure_rate: 0.03,
    support_ticket_rate: 0.15,
    crash_rate: 0.02,
    will_churn: false,
    churn_window_days: null,
    churn_reason: null,
    sessions_trend: 1.5,
  },
};
