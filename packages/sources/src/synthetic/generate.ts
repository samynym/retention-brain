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
  const start = opts.start_date ?? new Date("2026-01-01T00:00:00.000Z");
  const startMs = start.getTime();
  const totalWeight = personas.reduce((s, p) => s + p.weight, 0);
  const events: Event[] = [];
  const ground_truth: GroundTruthLabel[] = [];
  let evtCounter = 0;

  for (let i = 0; i < opts.num_users; i++) {
    const persona = sampleByWeight(personas, totalWeight, rng);
    const user_id = `user_${i}`;
    const email = `user${i}@example.test`;

    const willActuallyChurn = persona.profile.will_churn && rng() < 0.5;
    // churn lands in the last ~45% of the window
    const churnDay = willActuallyChurn
      ? Math.floor(opts.days * 0.55 + rng() * opts.days * 0.4)
      : null;

    ground_truth.push({
      user_id,
      persona: persona.name,
      will_churn: willActuallyChurn,
      churn_at: churnDay === null ? null : new Date(startMs + churnDay * 86_400_000).toISOString(),
      churn_reason: willActuallyChurn ? persona.profile.churn_reason : null,
    });

    events.push({
      id: `evt_${evtCounter++}`,
      user_id,
      kind: "subscription.purchase",
      timestamp: new Date(startMs - 86_400_000 * (1 + Math.floor(rng() * 60))).toISOString(),
      source: "synthetic",
      payload: { product: "pro_monthly", price: 9.99, currency: "USD", email },
    });

    for (let d = 0; d < opts.days; d++) {
      const dayMs = startMs + d * 86_400_000;

      if (churnDay !== null && d >= churnDay) {
        if (d === churnDay) {
          events.push({
            id: `evt_${evtCounter++}`,
            user_id,
            kind: "subscription.cancel",
            timestamp: new Date(dayMs).toISOString(),
            source: "synthetic",
            payload: { reason: persona.profile.churn_reason },
          });
        }
        continue;
      }

      const trendMult = computeTrendMult(persona, d, opts.days);

      // stochastic rounding so fractional rates accumulate over time
      const baselineDaily = persona.profile.sessions_per_week.mean / 7;
      const noise = (rng() - 0.5) * (persona.profile.sessions_per_week.sd / 7);
      const expectedSessions = Math.max(0, baselineDaily * trendMult + noise);
      const sessionsToday =
        Math.floor(expectedSessions) +
        (rng() < expectedSessions - Math.floor(expectedSessions) ? 1 : 0);

      for (let s = 0; s < sessionsToday; s++) {
        const ts = new Date(dayMs + Math.floor(rng() * 86_400_000)).toISOString();
        events.push({
          id: `evt_${evtCounter++}`,
          user_id,
          kind: "usage.session",
          timestamp: ts,
          source: "synthetic",
          payload: { duration_seconds: Math.floor(60 + rng() * 600) },
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

      if (rng() < persona.profile.crash_rate) {
        events.push({
          id: `evt_${evtCounter++}`,
          user_id,
          kind: "error.crash",
          timestamp: new Date(dayMs).toISOString(),
          source: "synthetic",
          payload: { stack: "synthetic crash trace" },
        });
      }

      // ticket rate is monthly, so divide by 30 for daily probability
      if (rng() < persona.profile.support_ticket_rate / 30) {
        const sentiment =
          persona.profile.churn_reason === "support_complaint" || rng() < 0.3
            ? "negative"
            : "neutral";
        events.push({
          id: `evt_${evtCounter++}`,
          user_id,
          kind: "support.ticket_open",
          timestamp: new Date(dayMs).toISOString(),
          source: "synthetic",
          payload: { sentiment },
        });
      }

      if (d > 0 && d % 30 === 29) {
        const failed = rng() < persona.profile.payment_failure_rate;
        events.push({
          id: `evt_${evtCounter++}`,
          user_id,
          kind: failed ? "payment.failure" : "payment.success",
          timestamp: new Date(dayMs).toISOString(),
          source: "synthetic",
          payload: { amount: 9.99, currency: "USD" },
        });
      }

      if (
        persona.profile.churn_reason === "payment_failure" &&
        rng() < persona.profile.payment_failure_rate / 30
      ) {
        events.push({
          id: `evt_${evtCounter++}`,
          user_id,
          kind: "payment.failure",
          timestamp: new Date(dayMs).toISOString(),
          source: "synthetic",
          payload: { amount: 9.99, currency: "USD", mid_cycle: true },
        });
      }
    }
  }

  return { events, ground_truth };
}

function computeTrendMult(persona: Persona, d: number, days: number): number {
  const denom = Math.max(1, days);
  const trend = persona.profile.sessions_trend;
  const profile = persona.profile.trend_profile ?? "linear";
  if (profile === "linear") {
    return 1 + (trend - 1) * (d / denom);
  }
  // rebound: dip linearly to `trend` at midpoint, then climb to ~1.5 by end
  const half = denom / 2;
  if (d <= half) {
    return 1 + (trend - 1) * (d / half);
  }
  return trend + (1.5 - trend) * ((d - half) / half);
}

function sampleByWeight(items: Persona[], totalWeight: number, rng: () => number): Persona {
  let r = rng() * totalWeight;
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
