import { describe, it, expect } from "vitest";
import { mapStripeWebhook } from "./map-stripe.js";

describe("mapStripeWebhook", () => {
  it("maps invoice.payment_failed to payment.failure", () => {
    const ev = mapStripeWebhook({
      id: "evt_1",
      type: "invoice.payment_failed",
      created: 1746230400, // 2025-05-02T22:40:00Z
      data: { object: { customer: "cus_X", metadata: { app_user_id: "u_42" } } },
    });
    expect(ev?.kind).toBe("payment.failure");
    expect(ev?.user_id).toBe("u_42");
    expect(ev?.source).toBe("mcp");
    expect(ev?.timestamp).toMatch(/^2025/);
  });

  it("falls back to customer id when metadata.app_user_id is missing", () => {
    const ev = mapStripeWebhook({
      id: "evt_2",
      type: "customer.subscription.deleted",
      created: 1746230400,
      data: { object: { customer: "cus_RAW" } },
    });
    expect(ev?.kind).toBe("subscription.cancel");
    expect(ev?.user_id).toBe("cus_RAW");
  });

  it("returns null for unrecognised types", () => {
    expect(
      mapStripeWebhook({ type: "ping", data: { object: { customer: "cus_X" } } })
    ).toBeNull();
  });

  it("returns null when no user identifier", () => {
    expect(
      mapStripeWebhook({ type: "invoice.payment_failed", created: 1, data: { object: {} } })
    ).toBeNull();
  });
});
