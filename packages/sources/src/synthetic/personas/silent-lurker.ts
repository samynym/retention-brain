import type { Persona } from "./types.js";

export const silent_lurker: Persona = {
  name: "silent_lurker",
  weight: 0.05,
  profile: {
    sessions_per_week: { mean: 0.5, sd: 0.5 },
    feature_events_per_session: { mean: 1, sd: 1 },
    payment_failure_rate: 0.01,
    support_ticket_rate: 0.02,
    crash_rate: 0.01,
    will_churn: false,
    churn_window_days: null,
    churn_reason: null,
    sessions_trend: 1.0,
  },
};
