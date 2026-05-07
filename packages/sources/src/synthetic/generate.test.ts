import { describe, it, expect } from "vitest";
import { generate } from "./generate.js";

describe("synthetic generate", () => {
  it("is deterministic given the same seed", () => {
    const a = generate({ num_users: 10, days: 7, seed: "test" });
    const b = generate({ num_users: 10, days: 7, seed: "test" });
    expect(a.events.length).toBe(b.events.length);
    expect(a.events[0]).toEqual(b.events[0]);
    expect(a.ground_truth).toEqual(b.ground_truth);
  });

  it("produces a purchase event for every user", () => {
    const { events, ground_truth } = generate({
      num_users: 50,
      days: 30,
      seed: "k1",
    });
    expect(ground_truth.length).toBe(50);
    const purchases = events.filter(
      (e) => e.kind === "subscription.purchase"
    );
    const uniqueUsers = new Set(purchases.map((e) => e.user_id));
    expect(uniqueUsers.size).toBe(50);
  });

  it("ground truth is consistent — churners stop having usage events after churn_at", () => {
    const { events, ground_truth } = generate({
      num_users: 200,
      days: 30,
      seed: "k2",
    });
    const churners = ground_truth.filter((g) => g.will_churn);
    expect(churners.length).toBeGreaterThan(0);
    for (const c of churners.slice(0, 10)) {
      const userEvents = events.filter(
        (e) =>
          e.user_id === c.user_id &&
          (e.kind === "usage.session" || e.kind === "usage.feature")
      );
      if (userEvents.length === 0) continue;
      const lastEvent = userEvents[userEvents.length - 1];
      expect(lastEvent).toBeDefined();
      expect(lastEvent!.timestamp <= c.churn_at!).toBe(true);
    }
  });

  it("persona weights produce roughly the expected distribution", () => {
    const { ground_truth } = generate({
      num_users: 1000,
      days: 7,
      seed: "k3",
    });
    const counts = new Map<string, number>();
    for (const g of ground_truth) {
      counts.set(g.persona, (counts.get(g.persona) ?? 0) + 1);
    }
    // loyal weight = 0.30; allow ±5 percentage points
    expect((counts.get("loyal") ?? 0) / 1000).toBeGreaterThan(0.25);
    expect((counts.get("loyal") ?? 0) / 1000).toBeLessThan(0.35);
    // lapsing weight = 0.10; allow ±5pp
    expect((counts.get("lapsing") ?? 0) / 1000).toBeGreaterThan(0.05);
    expect((counts.get("lapsing") ?? 0) / 1000).toBeLessThan(0.15);
  });

  it("declining-trend personas show fewer sessions late vs early in the window", () => {
    const days = 30;
    const start = new Date("2026-01-01T00:00:00.000Z");
    const { events, ground_truth } = generate({
      num_users: 500,
      days,
      seed: "trend-test",
      start_date: start,
    });
    // Use wavering — trend 0.4, mean 4 sessions/wk = enough activity to see deltas
    const waveringIds = new Set(
      ground_truth
        .filter((g) => g.persona === "wavering" && !g.will_churn)
        .map((g) => g.user_id)
    );
    expect(waveringIds.size).toBeGreaterThan(10);
    const sessionsInWindow = (dayStart: number, dayEnd: number) => {
      const t0 = start.getTime() + dayStart * 86_400_000;
      const t1 = start.getTime() + dayEnd * 86_400_000;
      return events.filter((e) => {
        if (!waveringIds.has(e.user_id)) return false;
        if (e.kind !== "usage.session") return false;
        const t = new Date(e.timestamp).getTime();
        return t >= t0 && t < t1;
      }).length;
    };
    const firstWeek = sessionsInWindow(0, 7);
    const lastWeek = sessionsInWindow(days - 7, days);
    // wavering trend = 0.4, so lastWeek should be materially less than firstWeek
    expect(lastWeek).toBeLessThan(firstWeek);
    expect(lastWeek / Math.max(1, firstWeek)).toBeLessThan(0.7);
  });
});
