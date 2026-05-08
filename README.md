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

### Stripe

```sh
export STRIPE_API_KEY=sk_test_...
```

```ts
import { stripeSource } from "@rcrb/sources-stripe";

const source = stripeSource({ apiKey: process.env.STRIPE_API_KEY! });
for await (const event of source.backfill({
  since: new Date(Date.now() - 30 * 86_400_000),
  until: new Date(),
})) {
  console.log(event);
}
```

For cross-source user matching with RevenueCat, set `metadata.app_user_id` on the Stripe Customer to the same id you use as RC's `app_user_id`. When present, the connector emits events keyed on that id; otherwise it falls back to the Stripe customer id (`cus_...`).

For Stripe webhooks, use `verifyAndMap(rawBody, headers["stripe-signature"], { webhookSecret })` from your webhook route. It uses Stripe's official `constructEvent` for signature verification and throws on bad signatures — return 400 in that case.

### Sentry

```sh
export SENTRY_AUTH_TOKEN=...      # user auth token with event:read + project:read
export SENTRY_ORG_SLUG=your-org
export SENTRY_PROJECT_SLUG=your-project
```

```ts
import { sentrySource } from "@rcrb/sources-sentry";

const source = sentrySource({
  authToken: process.env.SENTRY_AUTH_TOKEN!,
  orgSlug: process.env.SENTRY_ORG_SLUG!,
  projectSlug: process.env.SENTRY_PROJECT_SLUG!,
});

for await (const event of source.backfill({
  since: new Date(Date.now() - 14 * 86_400_000),
  until: new Date(),
})) {
  console.log(event);
}
```

For cross-source matching, set Sentry's `user.id` to your application's internal user id (the same one you use as RC's `app_user_id` / Stripe's `metadata.app_user_id`). The connector emits events keyed on `user.id` first, falling back to `user.email`. Sentry events with no user attribution are skipped — they aren't actionable for per-user retention.

`level: "fatal"` events map to `error.crash`; everything else maps to `error.client`. Pass `host` to `sentrySource` to point at a self-hosted Sentry instance.

MIT License.
