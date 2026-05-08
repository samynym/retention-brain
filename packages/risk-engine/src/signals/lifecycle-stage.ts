import type { UserTimeline } from "@rcrb/core";
import type { Signal } from "./types.js";

const DAY_MS = 86_400_000;

export function lifecycleStage(timeline: UserTimeline, nowIso?: string): Signal {
  const purchase = timeline.events.find((e) => e.kind === "subscription.purchase");
  if (!purchase) {
    return {
      name: "lifecycle_stage",
      score: 0,
      weight: 0.1,
      reason: "No subscription.purchase event in timeline.",
    };
  }
  const lastEvent = timeline.events[timeline.events.length - 1]!;
  const nowMs = new Date(nowIso ?? lastEvent.timestamp).getTime();
  const purchaseMs = new Date(purchase.timestamp).getTime();
  const days = Math.max(0, (nowMs - purchaseMs) / DAY_MS);

  let score: number;
  let stage: string;
  if (days < 30) {
    score = 0.3;
    stage = "new (<30d)";
  } else if (days < 90) {
    score = 0.5;
    stage = "early (30-90d)";
  } else if (days < 365) {
    score = 0.4;
    stage = "established (90-365d)";
  } else {
    score = 0.2;
    stage = "stable (>365d)";
  }

  return {
    name: "lifecycle_stage",
    score,
    weight: 0.1,
    reason: `Subscriber for ${days.toFixed(0)} days — ${stage}.`,
  };
}
