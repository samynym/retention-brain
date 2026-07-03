import { Event } from "@retention-brain/core";
import type { EventSource } from "./types.js";

/**
 * Native RevenueCat source (mobile subscriptions). The RC MCP is per-customer
 * (no batch backfill), and its OAuth token doesn't reach the REST API — so we
 * use the v2 REST API with a read-only key, mirroring the Stripe adapter. Lists
 * the project's customers, then expands each one's subscriptions into the
 * engine's Events. Billing-only signal by nature; keyed by email for merge.
 *
 * Field shapes follow the documented v2 model; tune against a real account.
 */
const BASE = "https://api.revenuecat.com/v2";

type RCList<T> = { items?: T[]; next_page?: string | null };
type RCCustomer = {
  id: string;
  // email may surface as a top-level field or under attributes.$email
  email?: string;
  attributes?: Record<string, { value?: string } | string | undefined>;
};
type RCTimestamp = number | string; // documented as ms epoch; tolerate ISO strings
type RCSubscription = {
  id?: string;
  product_id?: string;
  starts_at?: RCTimestamp;
  current_period_starts_at?: RCTimestamp;
  current_period_ends_at?: RCTimestamp;
  ends_at?: RCTimestamp;
  status?: string; // trialing | active | expired | in_grace_period | in_billing_retry | paused
  auto_renewal_status?: string; // will_renew | will_not_renew | ...
};

// ~100k customers — guards against a runaway loop without silently truncating
// a real beta account the way the old hard cap of 50 pages did.
const MAX_PAGES = 1000;

/** Coerce an RC timestamp (ms epoch, or an ISO string) to ms; undefined if unusable. */
function toMs(v?: RCTimestamp): number | undefined {
  if (typeof v === "number") return Number.isFinite(v) ? v : undefined;
  if (typeof v === "string") {
    const t = Date.parse(v);
    return Number.isNaN(t) ? undefined : t;
  }
  return undefined;
}

async function rcGet<T>(url: string, apiKey: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
  });
  if (!res.ok) throw new Error(`RevenueCat ${res.status} on ${new URL(url).pathname}`);
  return (await res.json()) as T;
}

function emailOf(c: RCCustomer): string | undefined {
  if (c.email) return c.email;
  const attr = c.attributes?.["$email"];
  if (typeof attr === "string") return attr;
  if (attr && typeof attr === "object" && attr.value) return attr.value;
  return undefined;
}

/** Resolve the first project id for a key (so the connect form stays one field). */
export async function revenueCatFirstProject(apiKey: string): Promise<string> {
  const data = await rcGet<RCList<{ id: string }>>(`${BASE}/projects`, apiKey);
  const id = data.items?.[0]?.id;
  if (!id) throw new Error("No RevenueCat project found for that key.");
  return id;
}

export function revenueCatSource(
  apiKey: string,
  projectId: string,
  name = "revenuecat",
): EventSource {
  return {
    name,
    async *backfill({ since, until }) {
      const sinceMs = since.getTime();
      const untilMs = until.getTime();
      const inWindow = (ms?: number) => typeof ms === "number" && ms >= sinceMs && ms <= untilMs;
      const iso = (ms: number) => new Date(ms).toISOString();

      let next: string | null = `${BASE}/projects/${projectId}/customers?limit=100`;
      let pages = 0;
      for (; next && pages < MAX_PAGES; pages++) {
        const page: RCList<RCCustomer> = await rcGet(next, apiKey);
        for (const cust of page.items ?? []) {
          const email = emailOf(cust);
          const userId = email ?? cust.id;
          if (!userId) continue; // can't key an event without an identity

          let subs: RCList<RCSubscription>;
          try {
            subs = await rcGet(
              `${BASE}/projects/${projectId}/customers/${cust.id}/subscriptions?limit=50`,
              apiKey,
            );
          } catch {
            continue; // skip a customer whose subs can't be read
          }

          for (const s of subs.items ?? []) {
            const payload = { email, product: s.product_id, status: s.status };
            const startsAt = toMs(s.starts_at);
            const periodStart = toMs(s.current_period_starts_at);
            const cancelMs = toMs(s.ends_at) ?? toMs(s.current_period_ends_at);

            // A single malformed record (bad shape, unparseable date) shouldn't
            // throw and abort the whole backfill — skip it and keep going.
            const emit = (id: string, kind: string, ms: number) => {
              try {
                return Event.parse({
                  id,
                  user_id: userId,
                  kind,
                  timestamp: iso(ms),
                  source: "revenuecat",
                  payload,
                });
              } catch (err) {
                console.warn(`[revenuecat] skipped ${kind} for ${userId}: ${String(err)}`);
                return null;
              }
            };

            if (inWindow(startsAt)) {
              const e = emit(
                `${s.id ?? cust.id}:start`,
                s.status === "trialing" ? "subscription.trial_start" : "subscription.purchase",
                startsAt!,
              );
              if (e) yield e;
            }

            // a renewal: a fresh current period that isn't the original start
            if (
              inWindow(periodStart) &&
              periodStart !== startsAt &&
              (s.status === "active" || s.auto_renewal_status === "will_renew")
            ) {
              const e = emit(`${s.id ?? cust.id}:renew`, "subscription.renewal", periodStart!);
              if (e) yield e;
            }

            // billing trouble → payment failure
            if (
              (s.status === "in_billing_retry" || s.status === "in_grace_period") &&
              inWindow(periodStart)
            ) {
              const e = emit(`${s.id ?? cust.id}:billing`, "payment.failure", periodStart!);
              if (e) yield e;
            }

            // cancel: auto-renew off, or expired
            if (
              (s.auto_renewal_status === "will_not_renew" || s.status === "expired") &&
              inWindow(cancelMs)
            ) {
              const e = emit(`${s.id ?? cust.id}:cancel`, "subscription.cancel", cancelMs!);
              if (e) yield e;
            }
          }
        }
        next = page.next_page ?? null;
      }
      if (next) {
        console.warn(
          `[revenuecat] stopped at ${MAX_PAGES} pages; more customers remain unread for project ${projectId}`,
        );
      }
    },
  };
}
