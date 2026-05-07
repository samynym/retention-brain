import seedrandom from "seedrandom";
import type { Event } from "@rcrb/core";
import { personas } from "./personas/index.js";
import type { Persona } from "./personas/types.js";
import type { GroundTruthLabel } from "./ground-truth.js";

export type GenerateOpts = {
  num_users: number;
  days: number;
  seed: string;
  start_date?: Date;
};

export type GenerateResult = {
  events: Event[];
  ground_truth: GroundTruthLabel[];
};

const FEATURES = [
  "dashboard",
  "export",
  "settings",
  "search",
  "share",
  "premium_feature_a",
  "premium_feature_b",
];

export function generate(opts: GenerateOpts): GenerateResult {
  const rng = seedrandom(opts.seed);
  // Default to a fixed reference date so the simulator is fully deterministic
  // given seed alone. Pass start_date explicitly for "now-relative" runs.
  const start = opts.start_date ?? new Date("2026-01-01T00:00:00.000Z");
  const events: Event[] = [];
  const ground_truth: GroundTruthLabel[] = [];
  let evtCounter = 0;

  for (let i = 0; i < opts.num_users; i++) {
    const persona = sampleByWeight(personas, rng);
    const user_id = `user_${i}`;
    const email = `user${i}@example.test`;

    // Decide churn: even within "will_churn" personas, only ~half actually churn
    const willActuallyChurn = persona.profile.will_churn && rng() < 0.5;
    const churnDay = willActuallyChurn
      ? Math.max(
          5,
          opts.days - (persona.profile.churn_window_days ?? 7) -
            Math.floor(rng() * 5)
        )
      : null;

    ground_truth.push({
      user_id,
      persona: persona.name,
      will_churn: willActuallyChurn,
      churn_at:
        churnDay === null
          ? null
          : new Date(start.getTime() + churnDay * 86_400_000).toISOString(),
      churn_reason: willActuallyChurn ? persona.profile.churn_reason : null,
    });

    // Initial purchase: between 1-60 days before window starts
    events.push({
      id: `evt_${evtCounter++}`,
      user_id,
      kind: "subscription.purchase",
      timestamp: new Date(
        start.getTime() - 86_400_000 * (1 + Math.floor(rng() * 60))
      ).toISOString(),
      source: "synthetic",
      payload: {
        product: "pro_monthly",
        price: 9.99,
        currency: "USD",
        email,
      },
    });

    // Per-day generation
    for (let d = 0; d < opts.days; d++) {
      // Stop activity at/after churn day
      if (churnDay !== null && d >= churnDay) {
        if (d === churnDay) {
          events.push({
            id: `evt_${evtCounter++}`,
            user_id,
            kind: "subscription.cancel",
            timestamp: new Date(
              start.getTime() + d * 86_400_000
            ).toISOString(),
            source: "synthetic",
            payload: { reason: persona.profile.churn_reason },
          });
        }
        continue;
      }

      // Daily multiplier: linear interpolation from 1.0 at d=0 to sessions_trend at d=days
      const trendMult =
        1 +
        (persona.profile.sessions_trend - 1) *
          (d / Math.max(1, opts.days));

      // Sessions today
      const baselineDaily = persona.profile.sessions_per_week.mean / 7;
      const noise =
        (rng() - 0.5) * (persona.profile.sessions_per_week.sd / 7);
      const sessionsToday = Math.max(
        0,
        Math.round(baselineDaily * trendMult + noise)
      );

      for (let s = 0; s < sessionsToday; s++) {
        const ts = new Date(
          start.getTime() +
            d * 86_400_000 +
            Math.floor(rng() * 86_400_000)
        ).toISOString();
        events.push({
          id: `evt_${evtCounter++}`,
          user_id,
          kind: "usage.session",
          timestamp: ts,
          source: "synthetic",
          payload: {
            duration_seconds: Math.floor(60 + rng() * 600),
          },
        });

        const featuresThisSession = Math.max(
          0,
          Math.round(
            persona.profile.feature_events_per_session.mean +
              (rng() - 0.5) * persona.profile.feature_events_per_session.sd
          )
        );
        for (let f = 0; f < featuresThisSession; f++) {
          events.push({
            id: `evt_${evtCounter++}`,
            user_id,
            kind: "usage.feature",
            timestamp: ts,
            source: "synthetic",
            payload: { feature: pickFeature(rng) },
          });
        }
      }

      // Crash event
      if (rng() < persona.profile.crash_rate) {
        events.push({
          id: `evt_${evtCounter++}`,
          user_id,
          kind: "error.crash",
          timestamp: new Date(
            start.getTime() + d * 86_400_000
          ).toISOString(),
          source: "synthetic",
          payload: { stack: "synthetic crash trace" },
        });
      }

      // Support ticket (rate is monthly → divide by 30 for daily probability)
      if (rng() < persona.profile.support_ticket_rate / 30) {
        const sentiment =
          persona.profile.churn_reason === "support_complaint" || rng() < 0.3
            ? "negative"
            : "neutral";
        events.push({
          id: `evt_${evtCounter++}`,
          user_id,
          kind: "support.ticket_open",
          timestamp: new Date(
            start.getTime() + d * 86_400_000
          ).toISOString(),
          source: "synthetic",
          payload: { sentiment },
        });
      }

      // Renewal day (every 30 days)
      if (d > 0 && d % 30 === 29) {
        const failed = rng() < persona.profile.payment_failure_rate;
        events.push({
          id: `evt_${evtCounter++}`,
          user_id,
          kind: failed ? "payment.failure" : "payment.success",
          timestamp: new Date(
            start.getTime() + d * 86_400_000
          ).toISOString(),
          source: "synthetic",
          payload: { amount: 9.99, currency: "USD" },
        });
      }

      // Free-rider personas: high payment-failure rate even mid-cycle
      if (
        persona.profile.churn_reason === "payment_failure" &&
        rng() < persona.profile.payment_failure_rate / 30
      ) {
        events.push({
          id: `evt_${evtCounter++}`,
          user_id,
          kind: "payment.failure",
          timestamp: new Date(
            start.getTime() + d * 86_400_000
          ).toISOString(),
          source: "synthetic",
          payload: { amount: 9.99, currency: "USD", mid_cycle: true },
        });
      }
    }
  }

  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { events, ground_truth };
}

function sampleByWeight(items: Persona[], rng: () => number): Persona {
  const total = items.reduce((s, p) => s + p.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1] as Persona;
}

function pickFeature(rng: () => number): string {
  const idx = Math.floor(rng() * FEATURES.length);
  return FEATURES[idx] as string;
}
