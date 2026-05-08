import type { Source } from "@rcrb/sources";
import { rcApi } from "./api.js";
import { mapTransaction } from "./map.js";

export type RevenueCatConfig = {
  apiKey: string;
  projectId: string;
  webhookSecret?: string;
};

export function revenueCatSource(config: RevenueCatConfig): Source {
  const api = rcApi(config);
  return {
    name: "revenuecat",
    async *backfill({ since, until }) {
      const sinceMs = since.getTime();
      const untilMs = until.getTime();
      for await (const customer of api.listCustomers()) {
        for await (const tx of api.listTransactions(customer.id)) {
          if (tx.purchased_at < sinceMs || tx.purchased_at >= untilMs) continue;
          const event = mapTransaction(tx, customer);
          if (event) yield event;
        }
      }
    },
  };
}

export { mapTransaction } from "./map.js";
export { verifyWebhook, mapWebhookEvent } from "./webhook.js";
export type { WebhookEvent } from "./webhook.js";
export type { RCCustomer, RCTransaction } from "./api.js";
