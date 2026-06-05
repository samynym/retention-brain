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
type RCSubscription = {
  id?: string;
  product_id?: string;
  starts_at?: number; // ms epoch
  current_period_starts_at?: number;
  current_period_ends_at?: number;
  ends_at?: number;
  status?: string; // trialing | active | expired | in_grace_period | in_billing_retry | paused
  auto_renewal_status?: string; // will_renew | will_not_renew | ...
};

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
      while (next && pages < 50) {
        const page: RCList<RCCustomer> = await rcGet(next, apiKey);
        for (const cust of page.items ?? []) {
          const email = emailOf(cust);
          const userId = email ?? cust.id;

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

            if (inWindow(s.starts_at)) {
              yield Event.parse({
                id: `${s.id ?? cust.id}:start`,
                user_id: userId,
                kind: s.status === "trialing" ? "subscription.trial_start" : "subscription.purchase",
                timestamp: iso(s.starts_at!),
                source: "revenuecat",
                payload,
              });
            }

            // a renewal: a fresh current period that isn't the original start
            if (
              inWindow(s.current_period_starts_at) &&
              s.current_period_starts_at !== s.starts_at &&
              (s.status === "active" || s.auto_renewal_status === "will_renew")
            ) {
              yield Event.parse({
                id: `${s.id ?? cust.id}:renew`,
                user_id: userId,
                kind: "subscription.renewal",
                timestamp: iso(s.current_period_starts_at!),
                source: "revenuecat",
                payload,
              });
            }

            // billing trouble → payment failure
            if (
              (s.status === "in_billing_retry" || s.status === "in_grace_period") &&
              inWindow(s.current_period_starts_at)
            ) {
              yield Event.parse({
                id: `${s.id ?? cust.id}:billing`,
                user_id: userId,
                kind: "payment.failure",
                timestamp: iso(s.current_period_starts_at!),
                source: "revenuecat",
                payload,
              });
            }

            // cancel: auto-renew off, or expired
            const cancelAt = s.ends_at ?? s.current_period_ends_at;
            if (
              (s.auto_renewal_status === "will_not_renew" || s.status === "expired") &&
              inWindow(cancelAt)
            ) {
              yield Event.parse({
                id: `${s.id ?? cust.id}:cancel`,
                user_id: userId,
                kind: "subscription.cancel",
                timestamp: iso(cancelAt!),
                source: "revenuecat",
                payload,
              });
            }
          }
        }
        next = page.next_page ?? null;
        pages++;
      }
    },
  };
}
