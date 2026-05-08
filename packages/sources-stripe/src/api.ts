import Stripe from "stripe";
import { KIND_MAP } from "./kinds.js";

export type StripeConfig = {
  apiKey: string;
  apiVersion?: Stripe.LatestApiVersion;
};

export function stripeApi(config: StripeConfig) {
  const stripe = new Stripe(config.apiKey, {
    ...(config.apiVersion ? { apiVersion: config.apiVersion } : {}),
    typescript: true,
  });

  return {
    async *listEvents(opts: { since: Date; until: Date }): AsyncIterable<Stripe.Event> {
      const sinceSec = Math.floor(opts.since.getTime() / 1000);
      const untilSec = Math.floor(opts.until.getTime() / 1000);
      // Stripe caps types[] at 20; we have 7.
      const types = Object.keys(KIND_MAP);
      for await (const event of stripe.events.list({
        created: { gte: sinceSec, lt: untilSec },
        limit: 100,
        types,
      })) {
        yield event;
      }
    },
  };
}
