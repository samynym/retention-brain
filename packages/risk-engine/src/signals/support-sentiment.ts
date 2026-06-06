import type { UserTimeline } from "@retention-brain/core";
import type { Signal } from "./types.js";

const DAY_MS = 86_400_000;
const WEIGHT = 0.05;

export function supportSentiment(timeline: UserTimeline, nowIso?: string): Signal {
  if (timeline.events.length === 0) {
    return {
      name: "support_sentiment",
      score: 0,
      weight: WEIGHT,
      reason: "No events in timeline.",
    };
  }
  const lastEvent = timeline.events[timeline.events.length - 1]!;
  const nowMs = new Date(nowIso ?? lastEvent.timestamp).getTime();
  const cutoff = nowMs - 14 * DAY_MS;

  let total = 0;
  let negative = 0;
  for (let i = timeline.events.length - 1; i >= 0; i--) {
    const e = timeline.events[i]!;
    const t = new Date(e.timestamp).getTime();
    if (t < cutoff) break;
    if (e.kind === "support.ticket_open") {
      total++;
      const sentiment = (e.payload as { sentiment?: unknown }).sentiment;
      if (sentiment === "negative") negative++;
    }
  }

  if (total === 0) {
    return {
      name: "support_sentiment",
      score: 0,
      weight: WEIGHT,
      reason: "No support tickets in the last 14 days.",
    };
  }

  const score = negative / total;
  return {
    name: "support_sentiment",
    score,
    weight: WEIGHT,
    reason: `${negative} of ${total} recent support tickets had negative sentiment.`,
  };
}
