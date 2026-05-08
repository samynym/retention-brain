import { describe, it, expect } from "vitest";
import { renderBriefing } from "../briefing.js";
import { parseFlaggedFromBriefing, parseThresholdFromBriefing } from "./reveal-future.js";
import type { RiskScore } from "@rcrb/risk-engine";
import type { UserTimeline } from "@rcrb/core";

function score(user_id: string, s: number): RiskScore {
  return {
    user_id,
    score: s,
    top_signals: [
      { name: "usage_decline", score: s, weight: 0.35, reason: "down" },
    ],
    narrative: "synthetic",
    llm_judge_available: false,
  };
}

function timeline(user_id: string, email?: string): UserTimeline {
  return {
    user_id,
    ...(email ? { email } : {}),
    created_at: "2026-01-01T00:00:00.000Z",
    events: [
      {
        id: `${user_id}_evt`,
        user_id,
        kind: "usage.session",
        timestamp: "2026-01-15T00:00:00.000Z",
        source: "synthetic",
        payload: {},
      },
    ],
  };
}

describe("briefing parser round-trip", () => {
  it("recovers flagged user labels from a rendered briefing", () => {
    const scores: RiskScore[] = [
      score("user_1", 0.92),
      score("user_2", 0.81),
      score("user_3", 0.55),
    ];
    const timelinesByUser = new Map<string, UserTimeline>([
      ["user_1", timeline("user_1", "alice@example.com")],
      ["user_2", timeline("user_2")],
      ["user_3", timeline("user_3")],
    ]);
    const md = renderBriefing({
      date: new Date("2026-02-01T00:00:00.000Z"),
      cutoffIso: "2026-02-01T00:00:00.000Z",
      threshold: 0.5,
      totalUsers: 3,
      scores,
      timelinesByUser,
      interventions: [],
      enabledSources: ["synthetic"],
    });
    const flagged = parseFlaggedFromBriefing(md);
    expect(flagged).toContain("alice@example.com");
    expect(flagged).toContain("user_2");
    expect(flagged).toContain("user_3");
  });

  it("recovers the threshold from the briefing summary line", () => {
    const md = renderBriefing({
      date: new Date("2026-02-01T00:00:00.000Z"),
      cutoffIso: "2026-02-01T00:00:00.000Z",
      threshold: 0.42,
      totalUsers: 1,
      scores: [score("user_1", 0.7)],
      timelinesByUser: new Map([["user_1", timeline("user_1")]]),
      interventions: [],
      enabledSources: ["synthetic"],
    });
    expect(parseThresholdFromBriefing(md)).toBe(0.42);
  });
});
