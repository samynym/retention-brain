import type { Briefing } from "../types/briefing";
import { supabase } from "./supabase";

/**
 * Client for the retention-brain backend. Every call carries the Supabase
 * session token; the backend verifies it. Analysis is async: `startAnalyze`
 * kicks off a run, poll `getLatest` for the result.
 */
const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export type RunState = "idle" | "running" | "done" | "error";
export type RunStatus = {
  state: RunState;
  startedAt?: string;
  finishedAt?: string;
  error?: string;
};

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export type Me = { email: string };

export async function getMe(): Promise<Me> {
  const res = await fetch(`${BASE}/api/me`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Auth check failed (${res.status}).`);
  return (await res.json()) as Me;
}

/** Kick off a run in the background. Returns quickly with the run status. */
export async function startAnalyze(opts?: { cheap?: boolean }): Promise<RunStatus> {
  const res = await fetch(`${BASE}/api/analyze`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify(opts ?? { cheap: true }),
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Couldn't start the analysis (${res.status}). ${detail}`.trim());
  }
  const data = (await res.json()) as { run: RunStatus };
  return data.run;
}

/** The latest cached briefing (may be stale while a run is in progress) + status. */
export async function getLatest(): Promise<{ briefing: Briefing | null; run: RunStatus }> {
  const res = await fetch(`${BASE}/api/briefing/latest`, { headers: await authHeaders() });
  if (!res.ok) throw new Error(`Backend unreachable (${res.status}).`);
  return (await res.json()) as { briefing: Briefing | null; run: RunStatus };
}

export type ConnectedSource = { kind: string; label: string | null };

/** Sources this user has already connected (kind + label, no secrets). */
export async function getSources(): Promise<ConnectedSource[]> {
  const res = await fetch(`${BASE}/api/sources`, { headers: await authHeaders() });
  if (!res.ok) return [];
  const data = (await res.json()) as { sources: ConnectedSource[] };
  return data.sources ?? [];
}

/** Begin an OAuth connect (Sentry, PostHog). Returns the provider's authorize URL. */
export async function startOAuth(provider: string): Promise<string> {
  const res = await fetch(`${BASE}/api/oauth/${provider}/start`, {
    method: "POST",
    headers: await authHeaders(),
  });
  const data = (await res.json().catch(() => ({}))) as { authUrl?: string; error?: string };
  if (!res.ok || !data.authUrl) throw new Error(data.error ?? `Couldn't start ${provider} connect.`);
  return data.authUrl;
}

/** Connect a key-based source (Stripe, RevenueCat). Validated + stored server-side. */
export async function connectKeySource(
  kind: "stripe" | "revenuecat",
  key: string,
): Promise<{ label: string }> {
  const res = await fetch(`${BASE}/api/sources/${kind}`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(await authHeaders()) },
    body: JSON.stringify({ key }),
  });
  const data = (await res.json().catch(() => ({}))) as { label?: string; error?: string };
  if (!res.ok) throw new Error(data.error ?? `Connect failed (${res.status}).`);
  return { label: data.label ?? kind };
}
