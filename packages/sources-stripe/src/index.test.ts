import { describe, it, expect } from "vitest";
import type Stripe from "stripe";
import { stripeSource, mapStripeEvent } from "./index.js";

const HAS_KEY = Boolean(process.env.STRIPE_API_KEY);

// Stripe.Event is a discriminated union of many specific event shapes; for test
// fixtures we cast through unknown to construct generic events without faithfully
// implementing every variant.
function makeEvent(type: string, object: Record<string, unknown>, id = "evt_test_1"): Stripe.Event {
  return {
    id,
    object: "event",
    api_version: "2024-06-20",
    created: 1_700_000_000,
    data: { object },
    livemode: false,
    pending_webhooks: 0,
    request: { id: null, idempotency_key: null },
    type,
  } as unknown as Stripe.Event;
}

describe("stripe mapping", () => {
  it("maps every KIND_MAP entry to the right EventKind", () => {
    const cases: Array<[string, string]> = [
      ["customer.subscription.created", "subscription.purchase"],
      ["customer.subscription.deleted", "subscription.cancel"],
      ["customer.subscription.trial_will_end", "subscription.trial_end"],
      ["invoice.payment_succeeded", "payment.success"],
      ["invoice.payment_failed", "payment.failure"],
      ["charge.failed", "payment.failure"],
      ["charge.refunded", "subscription.refund"],
    ];
    for (const [type, expected] of cases) {
      const event = mapStripeEvent(
        makeEvent(type, { customer: "cus_123", customer_email: "alice@example.com" }, `evt_${type}`),
      );
      expect(event, `mapping for ${type}`).not.toBeNull();
      expect(event!.kind).toBe(expected);
      expect(event!.source).toBe("stripe");
      expect(event!.user_id).toBe("cus_123");
      expect(event!.payload.email).toBe("alice@example.com");
      expect(event!.id).toBe(`stripe_evt_${type}`);
    }
  });

  it("resolves customer id from a nested customer object", () => {
    const event = mapStripeEvent(
      makeEvent("customer.subscription.created", {
        id: "sub_1",
        status: "active",
        customer: { id: "cus_456", email: "bob@example.com", deleted: false },
      }),
    );
    expect(event!.user_id).toBe("cus_456");
    expect(event!.payload.email).toBe("bob@example.com");
    expect(event!.payload.subscription_id).toBe("sub_1");
    expect(event!.payload.status).toBe("active");
  });

  it("prefers metadata.app_user_id over customer id for cross-source matching", () => {
    const event = mapStripeEvent(
      makeEvent("invoice.payment_succeeded", {
        customer: "cus_123",
        metadata: { app_user_id: "rc_user_789" },
      }),
    );
    expect(event!.user_id).toBe("rc_user_789");
    expect(event!.payload.app_user_id).toBe("rc_user_789");
  });

  it("returns null when there is no customer on the event object", () => {
    expect(mapStripeEvent(makeEvent("invoice.payment_succeeded", {}))).toBeNull();
  });

  it("returns null for unknown event types", () => {
    expect(mapStripeEvent(makeEvent("customer.created", { customer: "cus_1" }))).toBeNull();
  });

  it("attaches failure_message on payment failures when present", () => {
    const event = mapStripeEvent(
      makeEvent("charge.failed", { customer: "cus_1", failure_message: "card_declined" }),
    );
    expect(event!.payload.failure_message).toBe("card_declined");
  });
});

describe.skipIf(!HAS_KEY)("stripe source (live)", () => {
  it("backfills events from the last 7 days without throwing", async () => {
    const source = stripeSource({ apiKey: process.env.STRIPE_API_KEY! });
    const events: Array<{ source: string; user_id: string; timestamp: string }> = [];
    for await (const e of source.backfill({
      since: new Date(Date.now() - 7 * 86_400_000),
      until: new Date(),
    })) {
      events.push(e as { source: string; user_id: string; timestamp: string });
      if (events.length >= 5) break;
    }
    for (const e of events) {
      expect(e.source).toBe("stripe");
      expect(typeof e.user_id).toBe("string");
      expect(typeof e.timestamp).toBe("string");
    }
  }, 30_000);
});
