import { z } from "zod";
import { fetchWithRetry } from "@rcrb/sources";

const BASE_URL = "https://api.revenuecat.com/v2";

export const RCCustomer = z.object({
  id: z.string(),
  first_seen_at: z.number().optional(),
  last_seen_at: z.number().optional(),
  attributes: z.record(z.unknown()).optional(),
});
export type RCCustomer = z.infer<typeof RCCustomer>;

export const RCSubscription = z.object({
  id: z.string(),
  customer_id: z.string(),
  product_id: z.string().nullable().optional(),
  starts_at: z.number(),
  current_period_starts_at: z.number().optional(),
  current_period_ends_at: z.number().nullable().optional(),
  ends_at: z.number().nullable().optional(),
  status: z.string().optional(),
  store: z.string().optional(),
  environment: z.string().optional(),
});
export type RCSubscription = z.infer<typeof RCSubscription>;

export const RCPurchase = z.object({
  id: z.string(),
  customer_id: z.string().optional(),
  product_id: z.string().nullable().optional(),
  purchased_at: z.number(),
  store: z.string().optional(),
  is_refunded: z.boolean().optional(),
  refunded_at: z.number().nullable().optional(),
});
export type RCPurchase = z.infer<typeof RCPurchase>;

// RC v2 has no unified per-customer transaction feed, so backfill synthesizes
// these from /subscriptions and /purchases. Mid-period RENEWAL and BILLING_ISSUE
// only arrive via webhooks (mapWebhookEvent in webhook.ts).
export type RCTransaction = {
  id: string;
  kind: "INITIAL_PURCHASE" | "EXPIRATION" | "NON_RENEWING_PURCHASE";
  product_id: string | null;
  purchased_at: number; // ms epoch — for EXPIRATION this is the end time
  is_refunded?: boolean;
};

export type RCConfig = {
  apiKey: string;
  projectId: string;
};

const ListResponse = z.object({
  items: z.array(z.unknown()),
  next_page: z.string().nullable().optional(),
});

const MAX_PAGES = 1000;

export function rcApi(config: RCConfig) {
  const headers = {
    Authorization: `Bearer ${config.apiKey}`,
    Accept: "application/json",
  };

  async function get(path: string): Promise<unknown> {
    const url = path.startsWith("http") ? path : `${BASE_URL}${path}`;
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`RevenueCat ${res.status} ${res.statusText}: ${body}`);
    }
    return res.json();
  }

  async function* paginate<T>(initialPath: string, schema: z.ZodType<T>): AsyncIterable<T> {
    let next: string | null = initialPath;
    const seen = new Set<string>();
    let pages = 0;
    while (next) {
      if (seen.has(next)) throw new Error(`RevenueCat pagination cycle detected at ${next}`);
      if (++pages > MAX_PAGES) throw new Error(`RevenueCat pagination exceeded ${MAX_PAGES} pages`);
      seen.add(next);
      const raw = await get(next);
      const parsed = ListResponse.parse(raw);
      for (const item of parsed.items) yield schema.parse(item);
      next = parsed.next_page
        ? parsed.next_page.startsWith("http")
          ? parsed.next_page
          : `${BASE_URL.replace(/\/v2$/, "")}${parsed.next_page}`
        : null;
    }
  }

  const projectPath = `/projects/${encodeURIComponent(config.projectId)}`;

  return {
    listCustomers(): AsyncIterable<RCCustomer> {
      return paginate(`${projectPath}/customers?limit=100`, RCCustomer);
    },
    listSubscriptions(customerId: string): AsyncIterable<RCSubscription> {
      return paginate(
        `${projectPath}/customers/${encodeURIComponent(customerId)}/subscriptions?limit=100`,
        RCSubscription,
      );
    },
    listPurchases(customerId: string): AsyncIterable<RCPurchase> {
      return paginate(
        `${projectPath}/customers/${encodeURIComponent(customerId)}/purchases?limit=100`,
        RCPurchase,
      );
    },
    async *listTransactions(customerId: string): AsyncIterable<RCTransaction> {
      for await (const sub of this.listSubscriptions(customerId)) {
        yield {
          id: `sub_${sub.id}_start`,
          kind: "INITIAL_PURCHASE",
          product_id: sub.product_id ?? null,
          purchased_at: sub.starts_at,
        };
        if (sub.status === "expired" && sub.ends_at != null) {
          yield {
            id: `sub_${sub.id}_end`,
            kind: "EXPIRATION",
            product_id: sub.product_id ?? null,
            purchased_at: sub.ends_at,
          };
        }
      }
      for await (const p of this.listPurchases(customerId)) {
        yield {
          id: `purchase_${p.id}`,
          kind: "NON_RENEWING_PURCHASE",
          product_id: p.product_id ?? null,
          purchased_at: p.purchased_at,
          is_refunded: p.is_refunded ?? p.refunded_at != null,
        };
      }
    },
  };
}
