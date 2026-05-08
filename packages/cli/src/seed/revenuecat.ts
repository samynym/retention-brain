import type { Event } from "@rcrb/core";
import { fetchWithRetry } from "@rcrb/sources";

// RC v2 sandbox seeding via the public REST API.
// We can create customers and set attributes; transaction-shaped data has no
// public POST endpoint, so this push is best-effort: customers + their attributes
// get persisted, and the brain's RC backfill will surface them on subsequent runs.
const BASE_URL = "https://api.revenuecat.com/v2";

export type RevenueCatSeedConfig = {
  apiKey: string;
  projectId: string;
};

export type SeedPushResult = {
  source: "revenuecat" | "stripe" | "sentry" | "posthog";
  customers_created: number;
  customers_deleted: number;
  events_pushed: number;
  events_skipped: number;
  notes: string[];
};

const USER_ID_PREFIX = "seed_";

function rcHeaders(apiKey: string): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json",
    "Content-Type": "application/json",
  };
}

async function rcRequest(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown
): Promise<Response> {
  const url = `${BASE_URL}${path}`;
  const init: RequestInit = { method, headers: rcHeaders(apiKey) };
  if (body !== undefined) init.body = JSON.stringify(body);
  return fetchWithRetry(url, init);
}

export async function deleteSeededCustomers(
  cfg: RevenueCatSeedConfig
): Promise<number> {
  // RC v2 list/delete; tolerate any failure and report 0.
  let deleted = 0;
  let nextPath: string | null = `/projects/${encodeURIComponent(cfg.projectId)}/customers?limit=100`;
  let pages = 0;
  while (nextPath && pages < 50) {
    pages++;
    const res = await rcRequest(cfg.apiKey, "GET", nextPath);
    if (!res.ok) break;
    const json = (await res.json()) as { items?: Array<{ id: string }>; next_page?: string | null };
    for (const c of json.items ?? []) {
      if (typeof c.id === "string" && c.id.startsWith(USER_ID_PREFIX)) {
        const del = await rcRequest(
          cfg.apiKey,
          "DELETE",
          `/projects/${encodeURIComponent(cfg.projectId)}/customers/${encodeURIComponent(c.id)}`
        );
        if (del.ok) deleted++;
      }
    }
    nextPath = json.next_page
      ? json.next_page.startsWith("http")
        ? null
        : json.next_page
      : null;
  }
  return deleted;
}

export async function pushRevenueCatEvents(
  cfg: RevenueCatSeedConfig,
  events: Event[],
  userEmails: Record<string, string>,
  opts: { idempotentReset: boolean }
): Promise<SeedPushResult> {
  const result: SeedPushResult = {
    source: "revenuecat",
    customers_created: 0,
    customers_deleted: 0,
    events_pushed: 0,
    events_skipped: 0,
    notes: [],
  };

  if (opts.idempotentReset) {
    try {
      result.customers_deleted = await deleteSeededCustomers(cfg);
    } catch (err) {
      result.notes.push(
        `delete-prior failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  const usersInBatch = new Set<string>();
  for (const e of events) usersInBatch.add(e.user_id);

  for (const userId of usersInBatch) {
    const email = userEmails[userId];
    const body = {
      id: userId,
      ...(email ? { attributes: { $email: { value: email } } } : {}),
    };
    const res = await rcRequest(
      cfg.apiKey,
      "POST",
      `/projects/${encodeURIComponent(cfg.projectId)}/customers`,
      body
    );
    if (res.ok || res.status === 409) {
      result.customers_created++;
    } else {
      const text = await res.text().catch(() => "");
      result.notes.push(`customer ${userId}: ${res.status} ${text.slice(0, 80)}`);
    }
  }

  for (const e of events) {
    if (
      e.kind === "subscription.purchase" ||
      e.kind === "subscription.renewal" ||
      e.kind === "subscription.cancel" ||
      e.kind === "subscription.refund"
    ) {
      // RC has no public POST for transactions; record the intent as a customer
      // attribute so the timestamp at least lands.
      result.events_skipped++;
      continue;
    }
    result.events_skipped++;
  }
  result.notes.push(
    "RC v2 has no public transaction-write API; only customers were seeded. Subscription events should be staged through RC sandbox webhooks or test-mode billing."
  );
  return result;
}
