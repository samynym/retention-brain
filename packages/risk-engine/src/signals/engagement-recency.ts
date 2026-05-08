import type { UserTimeline } from "@rcrb/core";
import type { Signal } from "./types.js";

const DAY_MS = 86_400_000;

export function engagementRecency(timeline: UserTimeline, nowIso?: string): Signal {
  if (timeline.events.length === 0) {
    return {
      name: "engagement_recency",
      score: 0.7,
      weight: 0.15,
      reason: "No events in timeline.",
    };
  }

  let lastSessionMs: number | null = null;
  for (let i = timeline.events.length - 1; i >= 0; i--) {
    const e = timeline.events[i]!;
    if (e.kind === "usage.session") {
      lastSessionMs = new Date(e.timestamp).getTime();
      break;
    }
  }

  if (lastSessionMs === null) {
    return {
      name: "engagement_recency",
      score: 0.7,
      weight: 0.15,
      reason: "User has no usage sessions on record.",
    };
  }

  const lastEvent = timeline.events[timeline.events.length - 1]!;
  const nowMs = new Date(nowIso ?? lastEvent.timestamp).getTime();
  const daysSince = (nowMs - lastSessionMs) / DAY_MS;

  let score: number;
  if (daysSince > 14) score = 0.9;
  else if (daysSince > 7) score = 0.6;
  else if (daysSince > 3) score = 0.3;
  else score = 0;

  return {
    name: "engagement_recency",
    score,
    weight: 0.15,
    reason: `Last session ${daysSince.toFixed(1)} days ago.`,
  };
}
