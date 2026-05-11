import { createServer, type IncomingMessage, type ServerResponse, type Server } from "node:http";
import { createHmac, timingSafeEqual } from "node:crypto";
import { EventStore } from "./storage.js";
import { mapStripeWebhook } from "./map-stripe.js";
import { mapRevenueCatWebhook } from "./map-revenuecat.js";

export type WebhookServerOptions = {
  port: number;
  storePath: string;
  stripeWebhookSecret?: string;
  revenueCatWebhookSecret?: string;
  onEvent?: (info: { source: "stripe" | "revenuecat"; kind: string; user_id: string }) => void;
};

export type WebhookServerHandle = {
  close(): Promise<void>;
  port: number;
};

export async function startWebhookServer(opts: WebhookServerOptions): Promise<WebhookServerHandle> {
  const store = new EventStore(opts.storePath);

  const server: Server = createServer((req, res) => {
    handle(req, res, store, opts).catch((err) => {
      reply(res, 500, { error: err instanceof Error ? err.message : String(err) });
    });
  });

  await new Promise<void>((resolve) => server.listen(opts.port, resolve));
  const addr = server.address();
  const port = typeof addr === "object" && addr ? addr.port : opts.port;

  return {
    port,
    async close() {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    },
  };
}

async function handle(
  req: IncomingMessage,
  res: ServerResponse,
  store: EventStore,
  opts: WebhookServerOptions
): Promise<void> {
  if (req.method === "GET" && req.url === "/healthz") {
    reply(res, 200, { ok: true });
    return;
  }
  if (req.method !== "POST") {
    reply(res, 405, { error: "method not allowed" });
    return;
  }

  const raw = await readBody(req);

  if (req.url === "/webhooks/stripe") {
    if (opts.stripeWebhookSecret) {
      const sigHeader = headerString(req, "stripe-signature");
      if (!verifyStripeSignature(raw, sigHeader, opts.stripeWebhookSecret)) {
        reply(res, 401, { error: "stripe signature mismatch" });
        return;
      }
    }
    const body = safeParse(raw);
    const event = mapStripeWebhook(body);
    if (!event) {
      reply(res, 200, { ok: true, ignored: true });
      return;
    }
    await store.append(event);
    opts.onEvent?.({ source: "stripe", kind: event.kind, user_id: event.user_id });
    reply(res, 200, { ok: true });
    return;
  }

  if (req.url === "/webhooks/revenuecat") {
    if (opts.revenueCatWebhookSecret) {
      const auth = headerString(req, "authorization");
      // RC sends "Authorization: <secret>" — direct comparison
      if (!verifyShared(auth, opts.revenueCatWebhookSecret)) {
        reply(res, 401, { error: "revenuecat auth mismatch" });
        return;
      }
    }
    const body = safeParse(raw);
    const event = mapRevenueCatWebhook(body);
    if (!event) {
      reply(res, 200, { ok: true, ignored: true });
      return;
    }
    await store.append(event);
    opts.onEvent?.({ source: "revenuecat", kind: event.kind, user_id: event.user_id });
    reply(res, 200, { ok: true });
    return;
  }

  reply(res, 404, { error: "unknown route" });
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => chunks.push(c));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function reply(res: ServerResponse, status: number, body: object): void {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function headerString(req: IncomingMessage, name: string): string {
  const v = req.headers[name];
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

function safeParse(raw: string): unknown {
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

// Stripe signature format: t=timestamp,v1=hex,v0=hex
// Per https://docs.stripe.com/webhooks/signatures — only v1 is current.
export function verifyStripeSignature(raw: string, header: string, secret: string): boolean {
  if (!header || !secret) return false;
  const parts = header.split(",").reduce<Record<string, string>>((acc, p) => {
    const [k, v] = p.split("=");
    if (k && v) acc[k] = v;
    return acc;
  }, {});
  const ts = parts.t;
  const v1 = parts.v1;
  if (!ts || !v1) return false;
  const signed = `${ts}.${raw}`;
  const expected = createHmac("sha256", secret).update(signed).digest("hex");
  return safeEq(expected, v1);
}

function verifyShared(header: string, secret: string): boolean {
  if (!header || !secret) return false;
  const token = header.replace(/^Bearer\s+/i, "").trim();
  return safeEq(token, secret);
}

function safeEq(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}
