import { createHmac } from "node:crypto";
import { describe, it, expect } from "vitest";
import { revenueCatSource, mapTransaction, mapWebhookEvent, verifyWebhook } from "./index.js";
import type { RCCustomer, RCTransaction } from "./api.js";

const HAS_KEYS = Boolean(
  process.env.REVENUECAT_API_KEY && process.env.REVENUECAT_PROJECT_ID,
);

describe("revenuecat mapping", () => {
  const customer: RCCustomer = {
    id: "app_user_1",
    attributes: { $email: "alice@example.com" },
  };

  it("maps each KIND_MAP entry to the right EventKind", () => {
    const cases: Array<[RCTransaction["kind"], string]> = [
      ["INITIAL_PURCHASE", "subscription.purchase"],
      ["NON_RENEWING_PURCHASE", "subscription.purchase"],
      ["EXPIRATION", "subscription.cancel"],
    ];
    for (const [kind, expected] of cases) {
      const tx: RCTransaction = {
        id: `t_${kind}`,
        kind,
        product_id: "premium_monthly",
        purchased_at: 1_700_000_000_000,
      };
      const event = mapTransaction(tx, customer);
      expect(event).not.toBeNull();
      expect(event!.kind).toBe(expected);
      expect(event!.source).toBe("revenuecat");
      expect(event!.user_id).toBe("app_user_1");
      expect(event!.payload.email).toBe("alice@example.com");
      expect(event!.payload.product_id).toBe("premium_monthly");
    }
  });

  it("EXPIRATION carries reason=expiration in payload", () => {
    const event = mapTransaction(
      { id: "x", kind: "EXPIRATION", product_id: "p", purchased_at: 1_700_000_000_000 },
      customer,
    );
    expect(event!.payload.reason).toBe("expiration");
  });

  it("maps webhook RENEWAL → subscription.renewal", () => {
    const event = mapWebhookEvent({
      type: "RENEWAL",
      id: "evt_123",
      app_user_id: "app_user_1",
      product_id: "premium_monthly",
      event_timestamp_ms: 1_700_000_000_000,
    });
    expect(event!.kind).toBe("subscription.renewal");
    expect(event!.id).toBe("rc_evt_123");
  });

  it("maps BILLING_ISSUE → payment.failure", () => {
    const event = mapWebhookEvent({
      type: "BILLING_ISSUE",
      app_user_id: "u",
      event_timestamp_ms: 0,
    });
    expect(event!.kind).toBe("payment.failure");
  });

  it("returns null for unknown event types", () => {
    expect(
      mapWebhookEvent({ type: "TRANSFER", app_user_id: "u", event_timestamp_ms: 0 }),
    ).toBeNull();
  });

  it("verifyWebhook accepts matching bearer, rejects mismatches and empty", () => {
    expect(verifyWebhook("body", "shared-secret", "shared-secret")).toBe(true);
    expect(verifyWebhook("body", "wrong", "shared-secret")).toBe(false);
    expect(verifyWebhook("body", "", "shared-secret")).toBe(false);
  });

  it("verifyWebhook validates HMAC-SHA256 sha256=<hex> signatures", () => {
    const body = '{"event":{"type":"INITIAL_PURCHASE"}}';
    const secret = "whsec_test";
    const sig = `sha256=${createHmac("sha256", secret).update(body).digest("hex")}`;
    expect(verifyWebhook(body, sig, secret)).toBe(true);
    expect(verifyWebhook(body, "sha256=deadbeef", secret)).toBe(false);
  });
});

describe.skipIf(!HAS_KEYS)("revenuecat source (live)", () => {
  it("backfills events from a sandbox project", async () => {
    const source = revenueCatSource({
      apiKey: process.env.REVENUECAT_API_KEY!,
      projectId: process.env.REVENUECAT_PROJECT_ID!,
    });
    const events: unknown[] = [];
    for await (const e of source.backfill({
      since: new Date(Date.now() - 365 * 86_400_000),
      until: new Date(),
    })) {
      events.push(e);
      if (events.length >= 5) break;
    }
    // Sandbox may be empty (events.length === 0 is fine). When events do come back,
    // the loop body runs the real shape check.
    for (const e of events as Array<{ source: string; user_id: string; timestamp: string }>) {
      expect(e.source).toBe("revenuecat");
      expect(typeof e.user_id).toBe("string");
      expect(typeof e.timestamp).toBe("string");
    }
  }, 30_000);
});
