import { describe, it, expect } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createHmac } from "node:crypto";
import { startWebhookServer, verifyStripeSignature } from "./server.js";

async function post(port: number, path: string, body: string, headers: Record<string, string> = {}) {
  const res = await fetch(`http://127.0.0.1:${port}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body,
  });
  return { status: res.status, body: await res.json() };
}

describe("verifyStripeSignature", () => {
  it("accepts a valid v1 signature", () => {
    const raw = '{"id":"evt_1"}';
    const ts = "1746230400";
    const sig = createHmac("sha256", "whsec_test").update(`${ts}.${raw}`).digest("hex");
    const header = `t=${ts},v1=${sig}`;
    expect(verifyStripeSignature(raw, header, "whsec_test")).toBe(true);
  });

  it("rejects a tampered body", () => {
    const ts = "1746230400";
    const sig = createHmac("sha256", "whsec_test").update(`${ts}.original`).digest("hex");
    expect(verifyStripeSignature("tampered", `t=${ts},v1=${sig}`, "whsec_test")).toBe(false);
  });
});

describe("webhook server e2e", () => {
  it("stores a Stripe webhook event with no signature secret configured", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rcrb-srv-"));
    const storePath = join(dir, "events.jsonl");
    const handle = await startWebhookServer({ port: 0, storePath });
    try {
      const body = JSON.stringify({
        id: "evt_stripe_test",
        type: "invoice.payment_failed",
        created: 1746230400,
        data: { object: { customer: "cus_X", metadata: { app_user_id: "u_42" } } },
      });
      const { status, body: resBody } = await post(handle.port, "/webhooks/stripe", body);
      expect(status).toBe(200);
      expect(resBody).toMatchObject({ ok: true });
      const stored = readFileSync(storePath, "utf8").trim().split("\n");
      expect(stored).toHaveLength(1);
      const parsed = JSON.parse(stored[0]!);
      expect(parsed.user_id).toBe("u_42");
      expect(parsed.kind).toBe("payment.failure");
    } finally {
      await handle.close();
    }
  });

  it("stores a RevenueCat webhook event", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rcrb-srv-"));
    const storePath = join(dir, "events.jsonl");
    const handle = await startWebhookServer({ port: 0, storePath });
    try {
      const body = JSON.stringify({
        event: {
          type: "CANCELLATION",
          app_user_id: "rc_user_77",
          event_timestamp_ms: 1714564800000,
        },
      });
      const { status, body: resBody } = await post(handle.port, "/webhooks/revenuecat", body);
      expect(status).toBe(200);
      expect(resBody).toMatchObject({ ok: true });
      const parsed = JSON.parse(readFileSync(storePath, "utf8").trim().split("\n")[0]!);
      expect(parsed.user_id).toBe("rc_user_77");
      expect(parsed.kind).toBe("subscription.cancel");
    } finally {
      await handle.close();
    }
  });

  it("rejects a Stripe webhook when the signature is wrong", async () => {
    const dir = mkdtempSync(join(tmpdir(), "rcrb-srv-"));
    const storePath = join(dir, "events.jsonl");
    const handle = await startWebhookServer({
      port: 0,
      storePath,
      stripeWebhookSecret: "whsec_test",
    });
    try {
      const body = JSON.stringify({ id: "x", type: "invoice.payment_failed", created: 1, data: {} });
      const { status } = await post(handle.port, "/webhooks/stripe", body, {
        "stripe-signature": "t=1,v1=deadbeef",
      });
      expect(status).toBe(401);
    } finally {
      await handle.close();
    }
  });
});
