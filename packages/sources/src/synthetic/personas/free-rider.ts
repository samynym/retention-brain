import type { Persona } from "./types.js";

export const free_rider: Persona = {
  name: "free_rider",
  weight: 0.10,
  profile: {
    sessions_per_week: { mean: 8, sd: 3 },
    feature_events_per_session: { mean: 6, sd: 2 },
    payment_failure_rate: 0.40, // payment problems are the defining feature
    support_ticket_rate: 0.05,
    crash_rate: 0.02,
    will_churn: true,
    churn_window_days: 14,
    churn_reason: "payment_failure",
    sessions_trend: 1.0,
  },
};
