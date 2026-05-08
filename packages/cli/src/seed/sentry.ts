import type { Event } from "@rcrb/core";
import { fetchWithRetry } from "@rcrb/sources";
import type { SeedPushResult } from "./revenuecat.js";

// Sentry's /api/0/projects/.../store/ takes a DSN (not auth token). We use the
// envelope endpoint directly with the project DSN if provided; otherwise we
// fall back to the auth-token-protected legacy /store/ endpoint, which most
// modern projects still accept.
//
// Required env vars for seeding:
//   SENTRY_DSN (preferred) — public DSN for the project
//   or: SENTRY_AUTH_TOKEN + SENTRY_ORG_SLUG + SENTRY_PROJECT_SLUG (used to
//   look up the project's DSN via the API).

export type SentrySeedConfig = {
  dsn?: string;
  authToken?: string;
  orgSlug?: string;
  projectSlug?: string;
  host?: string;
};

type ParsedDsn = {
  publicKey: string;
  host: string;
  projectId: string;
  protocol: string;
};

function parseDsn(dsn: string): ParsedDsn {
  // form: https://<publicKey>@<host>/<projectId>
  const m = /^(https?):\/\/([^@]+)@([^/]+)\/(\d+)$/.exec(dsn);
  if (!m) throw new Error(`invalid Sentry DSN: ${dsn}`);
  return { protocol: m[1]!, publicKey: m[2]!, host: m[3]!, projectId: m[4]! };
}

async function resolveDsn(cfg: SentrySeedConfig): Promise<ParsedDsn | null> {
  if (cfg.dsn) return parseDsn(cfg.dsn);
  if (!cfg.authToken || !cfg.orgSlug || !cfg.projectSlug) return null;
  const host = cfg.host ?? "https://sentry.io";
  const url = `${host}/api/0/projects/${encodeURIComponent(cfg.orgSlug)}/${encodeURIComponent(cfg.projectSlug)}/keys/`;
  const res = await fetchWithRetry(url, {
    headers: { Authorization: `Bearer ${cfg.authToken}` },
  });
  if (!res.ok) return null;
  const json = (await res.json()) as Array<{ dsn?: { public?: string } }>;
  const first = json[0]?.dsn?.public;
  if (!first) return null;
  return parseDsn(first);
}

const KIND_TO_LEVEL: Record<string, "error" | "warning" | "info"> = {
  "error.crash": "error",
  "error.client": "warning",
};

const KIND_TO_TITLE: Record<string, string> = {
  "error.crash": "Synthetic crash (rcrb seed)",
  "error.client": "Synthetic client error (rcrb seed)",
};

export async function pushSentryEvents(
  cfg: SentrySeedConfig,
  events: Event[]
): Promise<SeedPushResult & { source: "sentry" }> {
  const result = {
    source: "sentry" as const,
    customers_created: 0,
    customers_deleted: 0,
    events_pushed: 0,
    events_skipped: 0,
    notes: [] as string[],
  };
  const parsed = await resolveDsn(cfg);
  if (!parsed) {
    result.notes.push("no SENTRY_DSN and could not resolve via API; skipping Sentry seed");
    return result;
  }
  const storeUrl = `${parsed.protocol}://${parsed.host}/api/${parsed.projectId}/store/`;
  for (const e of events) {
    const level = KIND_TO_LEVEL[e.kind];
    if (!level) {
      result.events_skipped++;
      continue;
    }
    const title = KIND_TO_TITLE[e.kind] ?? e.kind;
    const body = {
      event_id: e.id.replace(/[^a-f0-9]/gi, "").padEnd(32, "0").slice(0, 32),
      timestamp: e.timestamp,
      level,
      platform: "javascript",
      message: { formatted: title },
      tags: { rcrb_seed: "1", rcrb_user_id: e.user_id, rcrb_kind: e.kind },
      user: { id: e.user_id },
    };
    try {
      const res = await fetchWithRetry(storeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          // Modern Sentry accepts X-Sentry-Auth header with public key only
          "X-Sentry-Auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=rcrb-seed/0.0.1`,
        },
        body: JSON.stringify(body),
      });
      if (res.ok) result.events_pushed++;
      else {
        result.events_skipped++;
        if (result.notes.length < 3) {
          result.notes.push(`store ${res.status} ${res.statusText}`);
        }
      }
    } catch (err) {
      result.events_skipped++;
      if (result.notes.length < 3) {
        result.notes.push(
          `store error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
  return result;
}
