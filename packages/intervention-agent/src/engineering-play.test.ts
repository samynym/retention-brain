import { describe, it, expect } from "vitest";
import type { UserTimeline, Event } from "@retention-brain/core";
import type { RiskScore } from "@retention-brain/risk-engine";
import {
  generateEngineeringTicket,
  needsEngineeringPlay,
} from "./engineering-play.js";

const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

const crashEvent = (timestamp: string): Event => ({
  user_id: "user_crashy",
  timestamp,
  kind: "error.crash",
  id: `crash-${timestamp}`,
  source: "synthetic",
  payload: { type: "client", message: "NullPointerException in ExportView" },
});

const sessionEvent = (timestamp: string, user = "user_crashy"): Event => ({
  user_id: user,
  timestamp,
  kind: "usage.session",
  id: `session-${timestamp}`,
  source: "synthetic",
  payload: {},
});

const timelineWithCrashes: UserTimeline = {
  user_id: "user_crashy",
  email: "crashy@example.test",
  created_at: "2026-04-01T00:00:00.000Z",
  events: [
    sessionEvent("2026-04-15T10:00:00.000Z"),
    crashEvent("2026-04-20T11:00:00.000Z"),
    crashEvent("2026-04-22T11:00:00.000Z"),
    crashEvent("2026-04-25T11:00:00.000Z"),
  ],
};

const riskWithCrashSignal: RiskScore = {
  user_id: "user_crashy",
  score: 0.55,
  top_signals: [
    {
      name: "error_rate",
      score: 0.9,
      weight: 0.05,
      reason: "3 crashes in the last 14 days.",
    },
    {
      name: "engagement_recency",
      score: 0.4,
      weight: 0.35,
      reason: "Last session 10 days ago.",
    },
  ],
  narrative: "Repeated crashes followed by drop in engagement.",
  llm_judge_available: true,
};

const riskWithoutCrashSignal: RiskScore = {
  user_id: "user_quiet",
  score: 0.6,
  top_signals: [
    {
      name: "usage_decline",
      score: 0.8,
      weight: 0.35,
      reason: "Sessions dropped 80%.",
    },
  ],
  narrative: "Usage decline pattern.",
  llm_judge_available: true,
};

const quietTimeline: UserTimeline = {
  user_id: "user_quiet",
  created_at: "2026-04-01T00:00:00.000Z",
  events: [sessionEvent("2026-04-15T10:00:00.000Z", "user_quiet")],
};

describe("needsEngineeringPlay (pure logic)", () => {
  it("returns true when error_rate is in top_signals with positive score", () => {
    expect(
      needsEngineeringPlay(riskWithCrashSignal, timelineWithCrashes, "2026-05-01T00:00:00Z")
    ).toBe(true);
  });

  it("returns true when there are 2+ crashes in the last 14 days, even without error_rate signal", () => {
    expect(
      needsEngineeringPlay(riskWithoutCrashSignal, timelineWithCrashes, "2026-05-01T00:00:00Z")
    ).toBe(true);
  });

  it("returns false when there are no crashes and no error_rate signal", () => {
    expect(
      needsEngineeringPlay(riskWithoutCrashSignal, quietTimeline, "2026-05-01T00:00:00Z")
    ).toBe(false);
  });

  it("returns false when crashes are too old to count (outside 14d window)", () => {
    const oldCrashTimeline: UserTimeline = {
      user_id: "user_quiet",
      created_at: "2026-01-01T00:00:00.000Z",
      events: [
        crashEvent("2026-01-15T10:00:00.000Z"),
        crashEvent("2026-01-20T10:00:00.000Z"),
      ],
    };
    expect(
      needsEngineeringPlay(riskWithoutCrashSignal, oldCrashTimeline, "2026-05-01T00:00:00Z")
    ).toBe(false);
  });
});

describe.skipIf(!HAS_KEY)("generateEngineeringTicket (live LLM)", () => {
  it("produces a structured ticket with title, summary, action, and severity for a crash-driven user", async () => {
    const ticket = await generateEngineeringTicket(
      riskWithCrashSignal,
      timelineWithCrashes,
      { date: new Date("2026-05-01T00:00:00.000Z") }
    );
    expect(ticket).not.toBeNull();
    if (!ticket) return;

    expect(ticket.user_id).toBe("user_crashy");
    expect(ticket.filename).toMatch(/^2026-05-01-user_crashy-.*\.md$/);
    expect(ticket.copy.title.length).toBeGreaterThan(0);
    expect(ticket.copy.title.length).toBeLessThanOrEqual(120);
    expect(ticket.copy.summary.length).toBeGreaterThan(0);
    expect(ticket.copy.proposed_action.length).toBeGreaterThan(0);
    expect(["low", "medium", "high"]).toContain(ticket.copy.severity);

    expect(ticket.markdown).toContain("# ");
    expect(ticket.markdown).toContain("## Summary");
    expect(ticket.markdown).toContain("## Proposed action");
    expect(ticket.markdown).toContain("user_crashy");
  }, 90_000);

  it("returns null for a user with no crash signal", async () => {
    const ticket = await generateEngineeringTicket(
      riskWithoutCrashSignal,
      quietTimeline,
      { date: new Date("2026-05-01T00:00:00.000Z") }
    );
    expect(ticket).toBeNull();
  }, 30_000);
});
