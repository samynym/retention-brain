import type { Source } from "@rcrb/sources";
import { stripeApi, type StripeConfig } from "./api.js";
import { mapStripeEvent } from "./map.js";

export function stripeSource(config: StripeConfig): Source {
  const api = stripeApi(config);
  return {
    name: "stripe",
    async *backfill({ since, until }) {
      for await (const event of api.listEvents({ since, until })) {
        const mapped = mapStripeEvent(event);
        if (mapped) yield mapped;
      }
    },
  };
}

export type { StripeConfig };
export { mapStripeEvent } from "./map.js";
export { verifyAndMap } from "./webhook.js";
export { KIND_MAP } from "./kinds.js";
