import type { UserTimeline } from "@rcrb/core";
import type { Signal } from "./types.js";

const DAY_MS = 86_400_000;

/**
 * Compares last-7-day session count to the prior 23-day baseline.
 * If recent rate < baseline → score proportional to drop.
 * If baseline insufficient (<0.1/day), score 0.
 */
export function usageDecline(timeline: UserTimeline, nowIso?: string): Signal {
  const sessions = timeline.events.filter((e) => e.kind === "usage.session");
  if (sessions.length === 0) {
    return {
      name: "usage_decline",
      score: 0,
      weight: 0.3,
      reason: "No sessions in timeline; usage decline not measurable.",
    };
  }

  const lastEvent = timeline.events[timeline.events.length - 1]!;
  const nowMs = new Date(nowIso ?? lastEvent.timestamp).getTime();
  const recentCutoff = nowMs - 7 * DAY_MS;
  const baselineCutoff = nowMs - 30 * DAY_MS;

  let recent = 0;
  let baseline = 0;
  for (const s of sessions) {
    const t = new Date(s.timestamp).getTime();
    if (t >= recentCutoff) recent++;
    else if (t >= baselineCutoff) baseline++;
  }

  const recentRate = recent / 7;
  const baselineRate = baseline / 23;

  if (baselineRate < 0.1) {
    return {
      name: "usage_decline",
      score: 0,
      weight: 0.3,
      reason: `Baseline session rate too low (${baselineRate.toFixed(2)}/day) to detect decline.`,
    };
  }

  if (recentRate >= baselineRate) {
    return {
      name: "usage_decline",
      score: 0,
      weight: 0.3,
      reason: `Recent usage (${recentRate.toFixed(2)}/day) is at or above baseline (${baselineRate.toFixed(2)}/day).`,
    };
  }

  const drop = (baselineRate - recentRate) / baselineRate;
  const score = Math.max(0, Math.min(1, drop));
  return {
    name: "usage_decline",
    score,
    weight: 0.3,
    reason: `Last-7-day session rate ${recentRate.toFixed(2)}/day vs baseline ${baselineRate.toFixed(2)}/day (drop ${(drop * 100).toFixed(0)}%).`,
  };
}
