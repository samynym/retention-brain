import type { UserTimeline } from "@rcrb/core";
import type { Signal } from "./types.js";

const DAY_MS = 86_400_000;
const WEIGHT = 0.05;

export function errorRate(timeline: UserTimeline, nowIso?: string): Signal {
  if (timeline.events.length === 0) {
    return {
      name: "error_rate",
      score: 0,
      weight: WEIGHT,
      reason: "No events in timeline.",
    };
  }
  const lastEvent = timeline.events[timeline.events.length - 1]!;
  const nowMs = new Date(nowIso ?? lastEvent.timestamp).getTime();
  const cutoff = nowMs - 14 * DAY_MS;

  let crashes = 0;
  for (let i = timeline.events.length - 1; i >= 0; i--) {
    const e = timeline.events[i]!;
    const t = new Date(e.timestamp).getTime();
    if (t < cutoff) break;
    if (e.kind === "error.crash") crashes++;
  }

  let score: number;
  if (crashes > 5) score = 0.85;
  else if (crashes > 2) score = 0.55;
  else if (crashes > 0) score = 0.25;
  else score = 0;

  return {
    name: "error_rate",
    score,
    weight: WEIGHT,
    reason: crashes === 0 ? "No crashes in the last 14 days." : `${crashes} crash${crashes === 1 ? "" : "es"} in the last 14 days.`,
  };
}
