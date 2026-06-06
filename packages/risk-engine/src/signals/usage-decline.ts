import type { UserTimeline } from "@retention-brain/core";
import type { Signal } from "./types.js";

const DAY_MS = 86_400_000;

// Phase 5.5 tuning: weight bumped 0.30 → 0.35; added two extra branches so
// rate-math doesn't zero out users with declining patterns at low absolute
// rates: (a) early-window had activity, recent does not (decline detected
// at low rates); (b) baseline absolute count ≥ 3 collapsing to ≤ 1 in recent.
const WEIGHT = 0.35;

export function usageDecline(timeline: UserTimeline, nowIso?: string): Signal {
  const sessions = timeline.events.filter((e) => e.kind === "usage.session");
  const last = timeline.events[timeline.events.length - 1];
  if (!last) {
    return { name: "usage_decline", score: 0, weight: WEIGHT, reason: "No events in timeline." };
  }
  const nowMs = new Date(nowIso ?? last.timestamp).getTime();
  const recentCutoff = nowMs - 7 * DAY_MS;
  const baselineCutoff = nowMs - 30 * DAY_MS;
  // Split the 23-day baseline into early-half (first 12 days) and late-half.
  const earlyEnd = nowMs - 18 * DAY_MS;

  let recent = 0;
  let baseline = 0;
  let earlyHalf = 0;
  for (const s of sessions) {
    const t = new Date(s.timestamp).getTime();
    if (t >= recentCutoff) recent++;
    else if (t >= baselineCutoff) {
      baseline++;
      if (t < earlyEnd) earlyHalf++;
    }
  }

  // Early-window had activity but recent week is empty — declining pattern at
  // any baseline rate (catches lapsing users with sparse but front-loaded data).
  if (earlyHalf >= 1 && recent === 0 && earlyHalf > baseline - earlyHalf) {
    return {
      name: "usage_decline",
      score: 0.85,
      weight: WEIGHT,
      reason: `Early-window ${earlyHalf} sessions → recent 0/7d (decline at low absolute rate).`,
    };
  }

  // Absolute-count branch: meaningful baseline collapsing to near-zero in recent week.
  if (baseline >= 3 && recent <= 1) {
    const drop = Math.min(1, (baseline - recent * (23 / 7)) / baseline);
    return {
      name: "usage_decline",
      score: Math.max(0.6, drop),
      weight: WEIGHT,
      reason: `Baseline ${baseline} sessions/23d → recent ${recent}/7d (sharp drop).`,
    };
  }

  const recentRate = recent / 7;
  const baselineRate = baseline / 23;

  if (baselineRate < 0.05) {
    return {
      name: "usage_decline",
      score: 0,
      weight: WEIGHT,
      reason: `Baseline session rate too low (${baselineRate.toFixed(2)}/day) to detect decline.`,
    };
  }

  if (recentRate >= baselineRate) {
    return {
      name: "usage_decline",
      score: 0,
      weight: WEIGHT,
      reason: `Recent usage (${recentRate.toFixed(2)}/day) is at or above baseline (${baselineRate.toFixed(2)}/day).`,
    };
  }

  const drop = (baselineRate - recentRate) / baselineRate;
  return {
    name: "usage_decline",
    score: drop,
    weight: WEIGHT,
    reason: `Last-7-day session rate ${recentRate.toFixed(2)}/day vs baseline ${baselineRate.toFixed(2)}/day (drop ${(drop * 100).toFixed(0)}%).`,
  };
}
