import "dotenv/config";
import { fileURLToPath } from "node:url";
import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { cors } from "hono/cors";
import Stripe from "stripe";
import { analyze, type AnalyzeOpts } from "./analyze.js";
import { authMiddleware, type Env } from "./auth.js";
import { isConnectorKind } from "./connectors.js";
import { completeConnect, oauthSource, startConnect } from "./oauth.js";
import { fixtureSource } from "./sources/fixture.js";
import { revenueCatFirstProject, revenueCatSource } from "./sources/revenuecat.js";
import { stripeSource } from "./sources/stripe.js";
import type { EventSource } from "./sources/types.js";
import { admin } from "./supabase.js";
import {
  ANALYTICS_EVENTS,
  deleteSource,
  getLatestBriefing,
  getSourceSecret,
  listSources,
  recordAnalyticsEvent,
  saveBriefing,
  saveSource,
  type AnalyticsEventName,
  type SourceKind,
} from "./store.js";

const FRONTEND_FALLBACK = process.env.FRONTEND_URL ?? "http://localhost:5180";

/** The backend's own callback URL, derived from the request (proxy-aware). */
function oauthRedirect(c: { req: { header(name: string): string | undefined } }): string {
  const proto = c.req.header("x-forwarded-proto") ?? "http";
  const host = c.req.header("host") ?? `localhost:${process.env.PORT ?? 8787}`;
  return `${proto}://${host}/api/oauth/callback`;
}

/**
 * Hosted backend. Auth-gated (Supabase magic-link), per-user runs,
 * briefings persisted to Postgres. Analysis is async: `POST /api/analyze`
 * starts a background run scoped to the signed-in user; clients poll
 * `GET /api/briefing/latest` for the cached/fresh result. Source is still the
 * synthetic fixture — real per-org MCP sources (Stripe) land next.
 */

const PORT = Number(process.env.PORT ?? 8787);

const SYNTHETIC = fileURLToPath(
  new URL("../../../examples/synthetic-events.jsonl", import.meta.url),
);
const SYNTHETIC_CUTOFF = new Date("2026-05-08T00:00:00.000Z");

type RunState = "idle" | "running" | "done" | "error";
type RunStatus = {
  state: RunState;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

// Per-user run status (in-memory). Briefings themselves persist to Postgres.
const runs = new Map<string, RunStatus>();
const inflight = new Set<string>();

function startRun(userId: string, sources: EventSource[], opts: AnalyzeOpts): RunStatus {
  const existing = runs.get(userId);
  if (inflight.has(userId) && existing) return existing; // dedupe per user
  inflight.add(userId);
  const status: RunStatus = { state: "running", startedAt: new Date().toISOString() };
  runs.set(userId, status);
  void (async () => {
    try {
      const briefing = await analyze(sources, opts);
      await saveBriefing(userId, briefing);
      runs.set(userId, { ...status, state: "done", finishedAt: new Date().toISOString() });
    } catch (err) {
      runs.set(userId, {
        ...status,
        state: "error",
        finishedAt: new Date().toISOString(),
        error: err instanceof Error ? err.message : String(err),
      });
    } finally {
      inflight.delete(userId);
    }
  })();
  return status;
}

const app = new Hono<Env>();

app.get("/healthz", (c) => c.json({ ok: true }));

app.use("/api/*", cors());

// Public analytics intake. If a valid bearer token is present, attach the event
// to that user; pre-auth funnel events are stored without a user id.
app.post("/api/analytics", async (c) => {
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const eventName = typeof body.event === "string" ? body.event : "";
  if (!ANALYTICS_EVENTS.has(eventName as AnalyticsEventName)) {
    return c.json({ error: "Unknown analytics event." }, 400);
  }
  const event = eventName as AnalyticsEventName;

  const rawProperties =
    body.properties && typeof body.properties === "object" && !Array.isArray(body.properties)
      ? (body.properties as Record<string, unknown>)
      : {};
  const properties = Object.fromEntries(
    Object.entries(rawProperties).filter(([, value]) => {
      const t = typeof value;
      return value === null || t === "string" || t === "number" || t === "boolean";
    }),
  );

  let userId: string | null = null;
  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (token) {
    const { data } = await admin.auth.getUser(token);
    userId = data.user?.id ?? null;
  }

  try {
    await recordAnalyticsEvent(event, userId, properties);
  } catch (err) {
    console.error(err);
    return c.json({ error: "Analytics unavailable." }, 503);
  }
  return c.json({ ok: true });
});

// Everything else under /api requires a valid session.
app.use("/api/*", authMiddleware);

app.get("/api/me", (c) => {
  const user = c.get("user");
  return c.json({ email: user.email });
});

// List the user's connected sources (kind + label, never secrets).
app.get("/api/sources", async (c) => {
  const user = c.get("user");
  return c.json({ sources: await listSources(user.id) });
});

// Disconnect a source so it can be reconnected.
const SOURCE_KINDS: SourceKind[] = ["stripe", "revenuecat", "sentry", "posthog"];
app.delete("/api/sources/:kind", async (c) => {
  const user = c.get("user");
  const kind = c.req.param("kind") as SourceKind;
  if (!SOURCE_KINDS.includes(kind)) return c.json({ error: "Unknown source." }, 400);
  await deleteSource(user.id, kind);
  return c.json({ ok: true });
});

// Connect Stripe: validate the key, then store it encrypted for this user.
app.post("/api/sources/stripe", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!/^rk_(test|live)_/.test(key)) {
    return c.json({ error: "Paste a Stripe restricted key that starts with rk_." }, 400);
  }
  try {
    const stripe = new Stripe(key);
    await Promise.all([
      stripe.customers.list({ limit: 1 }),
      stripe.subscriptions.list({ limit: 1 }),
      stripe.charges.list({ limit: 1 }),
    ]);
  } catch {
    return c.json(
      { error: "Stripe rejected that key. Set Customers, Subscriptions, and Charges to Read." },
      400,
    );
  }
  const label = "Stripe";
  await saveSource(user.id, "stripe", label, key);
  return c.json({ ok: true, label });
});

// Connect RevenueCat: validate the key, resolve the project, store both.
app.post("/api/sources/revenuecat", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const key = typeof body.key === "string" ? body.key.trim() : "";
  if (!key) return c.json({ error: "Paste a RevenueCat v2 API key." }, 400);
  let projectId: string;
  try {
    projectId = await revenueCatFirstProject(key);
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : "RevenueCat rejected that key." }, 400);
  }
  await saveSource(user.id, "revenuecat", "RevenueCat", JSON.stringify({ key, projectId }));
  return c.json({ ok: true, label: "RevenueCat" });
});

// Start an OAuth connect flow (Sentry, PostHog). Returns the provider's auth URL.
app.post("/api/oauth/:provider/start", async (c) => {
  const user = c.get("user");
  const provider = c.req.param("provider");
  if (!provider || !isConnectorKind(provider)) return c.json({ error: "Unknown provider." }, 400);
  const returnTo = c.req.header("origin") ?? FRONTEND_FALLBACK;
  try {
    const authUrl = await startConnect(user.id, provider, oauthRedirect(c), returnTo);
    return c.json({ authUrl });
  } catch (err) {
    return c.json({ error: err instanceof Error ? err.message : String(err) }, 500);
  }
});

// OAuth callback — hit by the provider's browser redirect (no session here; the
// `state` ties it to the user). Stores tokens, then bounces back to the app.
app.get("/api/oauth/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  const oauthErr = c.req.query("error");
  if (oauthErr) return c.redirect(`${FRONTEND_FALLBACK}/?connect_error=${encodeURIComponent(oauthErr)}`);
  if (!code || !state) return c.redirect(`${FRONTEND_FALLBACK}/?connect_error=missing_params`);
  try {
    const { kind, returnTo } = await completeConnect(state, code, oauthRedirect(c));
    return c.redirect(`${returnTo}/?connected=${kind}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.redirect(`${FRONTEND_FALLBACK}/?connect_error=${encodeURIComponent(msg)}`);
  }
});

// Allowlist-gated routes.
app.post("/api/analyze", async (c) => {
  const user = c.get("user");
  const body = await c.req.json().catch(() => ({}) as Record<string, unknown>);
  const cheap = body.cheap !== false;
  const maxInterventions =
    typeof body.maxInterventions === "number" ? body.maxInterventions : cheap ? 3 : 20;

  // Build a source per connected provider (Stripe native; Sentry/PostHog via MCP+OAuth).
  const connected = await listSources(user.id);
  const sources: EventSource[] = [];
  for (const s of connected) {
    if (s.kind === "stripe") {
      const sec = await getSourceSecret(user.id, "stripe");
      if (sec) sources.push(stripeSource(sec.secret, "stripe"));
    } else if (s.kind === "revenuecat") {
      const sec = await getSourceSecret(user.id, "revenuecat");
      if (sec) {
        const { key, projectId } = JSON.parse(sec.secret) as { key: string; projectId: string };
        sources.push(revenueCatSource(key, projectId, "revenuecat"));
      }
    } else if (isConnectorKind(s.kind)) {
      const src = await oauthSource(user.id, s.kind);
      if (src) sources.push(src);
    }
  }

  // Fall back to the synthetic demo if nothing real is connected yet.
  const usingReal = sources.length > 0;
  if (!usingReal) sources.push(fixtureSource(SYNTHETIC, "synthetic"));

  const opts: AnalyzeOpts = {
    now: usingReal ? new Date() : SYNTHETIC_CUTOFF,
    threshold: 0.4,
    scoreUseLLM: cheap ? false : undefined,
    maxInterventions,
  };

  const run = startRun(user.id, sources, opts);
  return c.json({ run });
});

app.get("/api/status", async (c) => {
  const user = c.get("user");
  const briefing = await getLatestBriefing(user.id);
  return c.json({
    run: runs.get(user.id) ?? { state: "idle" },
    hasBriefing: briefing !== null,
  });
});

app.get("/api/briefing/latest", async (c) => {
  const user = c.get("user");
  const briefing = await getLatestBriefing(user.id);
  return c.json({ briefing, run: runs.get(user.id) ?? { state: "idle" } });
});

serve({ fetch: app.fetch, port: PORT }, (info) => {
  console.log(`retention-brain server on http://localhost:${info.port}`);
});
