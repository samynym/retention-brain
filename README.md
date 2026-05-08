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
export SENTRY_DSN=...             # optional, used by seed-sandbox to write synthetic events
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

### PostHog

```sh
export POSTHOG_PERSONAL_API_KEY=phx_...      # for reads (events backfill)
export POSTHOG_PROJECT_ID=12345
export POSTHOG_PROJECT_API_KEY=phc_...        # for writes (seed-sandbox capture)
# Optional — override for EU cloud or self-hosted (default: https://us.posthog.com)
export POSTHOG_HOST=https://eu.posthog.com
```

```ts
import { postHogSource } from "@rcrb/sources-posthog";

const source = postHogSource({
  personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
  projectId: process.env.POSTHOG_PROJECT_ID!,
  host: process.env.POSTHOG_HOST,
});

for await (const event of source.backfill({
  since: new Date(Date.now() - 7 * 86_400_000),
  until: new Date(),
})) {
  console.log(event);
}
```

For cross-source matching, set `app_user_id` either as a person property (via `$set`/`$identify`) or as an event property in your captures. The connector emits events keyed on that id when present, falling back to `distinct_id`. PostHog's `$email` property surfaces in the event payload as `email`.

`$session_start` events map to `usage.session`; everything else (custom events, `$pageview`, `$autocapture`) maps to `usage.feature`. `$identify`/`$set`/`$groupidentify` are skipped (metadata, not behavior).

## Sandbox setup (one-time)

The temporal-holdout commands (`seed-sandbox` + `reveal-future`) push synthetic events to your sandboxes, then read them back via real APIs to measure precision/recall. For temporally-accurate sandbox testing, configure RC to observe Stripe — that's how RC is actually used in production:

1. Create a Stripe **test mode** account (or use an existing one) and grab `sk_test_...`.
2. Create an RC sandbox project at https://app.revenuecat.com.
3. In RC sandbox: **Project Settings → Apps → New App → Stripe** and paste your Stripe test secret key. RC will now observe all Stripe test mode events (subscription created/cancelled/etc.) and surface them via its API.
4. Set both keys in your `.env`:

   ```sh
   STRIPE_API_KEY=sk_test_...
   REVENUECAT_API_KEY=sk_...           # RC sandbox secret key
   REVENUECAT_PROJECT_ID=proj_...
   ```

`seed-sandbox` then pushes synthetic events to Stripe — using **Stripe Test Clocks** so subscriptions, renewals, and cancellations fire at simulated timestamps over the synthetic timeline rather than at wall-clock now. RC observes those events automatically through its Stripe app integration, and the brain reads from both via real APIs. Direct RC writes are intentionally not used because RC v2 has no public POST `/transactions` endpoint — the Stripe-as-billing-platform pattern is the right model.

`reveal-future` advances the Test Clock to the end of the eval window, then backfills every configured source to compute actuals vs. the prior briefing's predictions. The temporal-holdout report cross-checks real-API actuals against the local staged file and surfaces any drift.

### Cleanup

`seed-sandbox` defaults to `--reset`, which deletes prior `rcrb_seed_*` test clocks (cascades to attached customers) and any leftover seed customers. Pass `--no-reset` to layer on top of an existing seed.

MIT License.
