import type { UserTimeline } from "@rcrb/core";
import type { Signal } from "./types.js";

const DAY_MS = 86_400_000;

export function paymentHealth(timeline: UserTimeline, nowIso?: string): Signal {
  if (timeline.events.length === 0) {
    return {
      name: "payment_health",
      score: 0,
      weight: 0.2,
      reason: "No events in timeline.",
    };
  }
  const lastEvent = timeline.events[timeline.events.length - 1]!;
  const nowMs = new Date(nowIso ?? lastEvent.timestamp).getTime();
  const cutoff = nowMs - 14 * DAY_MS;

  // timeline is sorted ascending; walk from the end to find the latest events first
  let mostRecentFailure: { timestamp: string } | null = null;
  let mostRecentSuccess: { timestamp: string } | null = null;
  for (let i = timeline.events.length - 1; i >= 0; i--) {
    const e = timeline.events[i]!;
    const t = new Date(e.timestamp).getTime();
    if (t < cutoff) break;
    if (e.kind === "payment.failure" && mostRecentFailure === null) {
      mostRecentFailure = { timestamp: e.timestamp };
    } else if (e.kind === "payment.success" && mostRecentSuccess === null) {
      mostRecentSuccess = { timestamp: e.timestamp };
    }
  }

  if (mostRecentFailure === null) {
    return {
      name: "payment_health",
      score: 0,
      weight: 0.2,
      reason: "No payment failure in the last 14 days.",
    };
  }

  if (mostRecentSuccess !== null && mostRecentSuccess.timestamp > mostRecentFailure.timestamp) {
    return {
      name: "payment_health",
      score: 0,
      weight: 0.2,
      reason: "Payment failure was recovered by a subsequent success.",
    };
  }

  return {
    name: "payment_health",
    score: 0.9,
    weight: 0.2,
    reason: "Recent payment failure with no subsequent success.",
  };
}
