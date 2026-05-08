import type { Persona } from "./types.js";

export const crashy_loyal: Persona = {
  name: "crashy_loyal",
  weight: 0.05,
  profile: {
    sessions_per_week: { mean: 12, sd: 3 },
    feature_events_per_session: { mean: 6, sd: 2 },
    payment_failure_rate: 0.02,
    support_ticket_rate: 0.05,
    crash_rate: 0.20,
    will_churn: false,
    churn_window_days: null,
    churn_reason: null,
    sessions_trend: 1.0,
  },
};
