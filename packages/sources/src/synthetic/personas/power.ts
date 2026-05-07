import type { Persona } from "./types.js";

export const power: Persona = {
  name: "power",
  weight: 0.10,
  profile: {
    sessions_per_week: { mean: 25, sd: 5 },
    feature_events_per_session: { mean: 15, sd: 3 },
    payment_failure_rate: 0.01,
    support_ticket_rate: 0.10,
    crash_rate: 0.02,
    will_churn: false,
    churn_window_days: null,
    churn_reason: null,
    sessions_trend: 1.0,
  },
};
