import { describe, it, expect } from "vitest";
import { mapRevenueCatWebhook } from "./map-revenuecat.js";

describe("mapRevenueCatWebhook", () => {
  it("maps CANCELLATION to subscription.cancel using event_timestamp_ms", () => {
    const ev = mapRevenueCatWebhook({
      event: {
        type: "CANCELLATION",
        app_user_id: "rc_user_1",
        event_timestamp_ms: 1714564800000,
      },
    });
    expect(ev?.kind).toBe("subscription.cancel");
    expect(ev?.user_id).toBe("rc_user_1");
    expect(ev?.timestamp).toBe("2024-05-01T12:00:00.000Z");
  });

  it("maps BILLING_ISSUE to payment.failure", () => {
    const ev = mapRevenueCatWebhook({
      event: { type: "BILLING_ISSUE", app_user_id: "u", event_timestamp_ms: 1 },
    });
    expect(ev?.kind).toBe("payment.failure");
  });

  it("accepts payload without the `event` wrapper", () => {
    const ev = mapRevenueCatWebhook({
      type: "INITIAL_PURCHASE",
      app_user_id: "u",
      event_timestamp_ms: 1714564800000,
    });
    expect(ev?.kind).toBe("subscription.purchase");
  });

  it("returns null for unknown types", () => {
    expect(
      mapRevenueCatWebhook({ event: { type: "MYSTERY", app_user_id: "u", event_timestamp_ms: 1 } })
    ).toBeNull();
  });

  it("returns null when no app_user_id", () => {
    expect(
      mapRevenueCatWebhook({ event: { type: "CANCELLATION", event_timestamp_ms: 1 } })
    ).toBeNull();
  });
});
