# rc-retention-brain

A continuous, cross-source, per-user retention agent for subscription apps.

**Status:** in development. See [`SPEC.md`](./SPEC.md) and [`PLAN.md`](./PLAN.md).

## Sources

### RevenueCat

```sh
export REVENUECAT_API_KEY=sk_...
export REVENUECAT_PROJECT_ID=proj_...
```

Or in your code:

```ts
import { revenueCatSource } from "@rcrb/sources-revenuecat";

const source = revenueCatSource({
  apiKey: process.env.REVENUECAT_API_KEY!,
  projectId: process.env.REVENUECAT_PROJECT_ID!,
});

for await (const event of source.backfill({
  since: new Date(Date.now() - 30 * 86_400_000),
  until: new Date(),
})) {
  console.log(event);
}
```

The connector also exports `verifyWebhook(rawBody, signature, secret)` and `mapWebhookEvent(event)` for ingesting live RevenueCat webhooks. RC's default webhook auth is a shared-secret bearer token; `verifyWebhook` accepts that or an HMAC-SHA256 `sha256=<hex>` signature when fronted by a signing proxy.

MIT License.
