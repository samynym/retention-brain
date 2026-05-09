# rc-retention-brain

A continuous, cross-source, per-user retention agent for subscription apps.

## Install in 3 minutes

```sh
git clone https://github.com/<you>/rc-retention-brain && cd rc-retention-brain
pnpm install

pnpm rcrb init                              # interactive prompts; writes .env
pnpm rcrb seed-sandbox --train-days 30 --eval-days 30
pnpm rcrb run                               # writes briefing-<date>.md
```

That gives you a real briefing on real-API sandbox data. To validate the brain's predictions against actual outcomes:

```sh
pnpm rcrb reveal-future
```

> `pnpm rcrb` is a workspace shortcut for `tsx packages/cli/src/index.ts`. Once published to npm, you'll be able to use `npx rc-retention-brain <command>` instead.

## What it does

Reads subscription state, payment health, errors, and usage from up to 4 sources (RevenueCat, Stripe, Sentry, PostHog), scores each user's churn risk, and writes a markdown briefing with personalized retention plays per at-risk user. Briefing-only — it does not send anything to your customers.

The brain looks at each user's full timeline across sources and asks: payment trouble, support friction, usage decline, or recent errors? Each at-risk user gets a per-user explanation grounded in their actual events, plus an LLM-drafted intervention (channel, offer, timing, copy) when `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` is set (see [LLM provider](#llm-provider)).

A sample briefing lives at [`examples/briefing-sample.md`](./examples/briefing-sample.md).

For the full spec see [`SPEC.md`](./SPEC.md) and [`PRODUCT.md`](./PRODUCT.md).

## LLM provider

The brain works with either Anthropic (Claude) or OpenAI (GPT). Set one API key:

```sh
export ANTHROPIC_API_KEY=sk-ant-...    # uses Claude
# or
export OPENAI_API_KEY=sk-...           # uses GPT
```

Provider is auto-detected from whichever key is set. To force a specific provider when both are configured, or override the model:

```sh
export LLM_PROVIDER=openai             # "anthropic" | "openai"
export LLM_MODEL=gpt-4o                # override default generator model
export LLM_CRITIC_MODEL=claude-opus-4-7 # override eval/critic model
```

Defaults: Anthropic uses `claude-sonnet-4-6` (generator) + `claude-opus-4-7` (critic). OpenAI uses `gpt-5` for both. Without any key, the brain still produces heuristic-only briefings — the LLM only enriches scoring narrative and drafts intervention copy.

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

### Plug any MCP

Any tool that exposes an MCP server (stdio or HTTP) can be a source. No tool-specific code lives in this repo — you point us at the server, name a tool to call, and either give us a field-path mapping or let an LLM convert the output to events. Configure either via a JSON file or env vars; the JSON file wins if present.

#### JSON config (recommended for >1 source)

`.rcrb/mcp.json` (or `rcrb.config.json`):

```json
{
  "sources": [
    {
      "label": "support",
      "command": "npx",
      "args": ["-y", "your-mcp-package"],
      "tool": "list_records",
      "mapper": "llm",
      "hint": "support tickets and customer messages"
    },
    {
      "label": "crm",
      "url": "https://your-mcp.example.com",
      "headers": { "Authorization": "Bearer ${CRM_TOKEN}" },
      "tool": "fetch_events",
      "mapper": "config",
      "mapping": {
        "user_id": "$.contact.email",
        "timestamp": "$.updated_at",
        "kind": "usage.feature"
      }
    }
  ]
}
```

#### Env-var pattern (handy for one source)

Pick a label freely — `support`, `crm`, anything. Uppercase it in env-var names.

```sh
export MCP_SOURCES=foo,bar

# stdio transport
export MCP_FOO_COMMAND="npx -y your-mcp-package"
export MCP_FOO_TOOL=list_records
export MCP_FOO_MAPPER=llm                # default when MAPPING not set

# http transport + config mapper
export MCP_BAR_URL=https://your-mcp.example.com
export MCP_BAR_HEADERS='{"Authorization":"Bearer ..."}'
export MCP_BAR_TOOL=fetch_events
export MCP_BAR_MAPPING='{"user_id":"$.user.id","timestamp":"$.ts","kind":"usage.feature"}'
```

Recognized fields per label (`<LABEL>` = uppercased label, non-alphanumeric becomes `_`):

| Field | Purpose |
|---|---|
| `MCP_<LABEL>_COMMAND` | stdio command (mutually exclusive with URL) |
| `MCP_<LABEL>_URL` | HTTP MCP endpoint |
| `MCP_<LABEL>_HEADERS` | JSON headers for HTTP transport |
| `MCP_<LABEL>_ENV` | JSON env vars passed to a stdio child |
| `MCP_<LABEL>_TOOL` | name of the MCP tool to invoke |
| `MCP_<LABEL>_ARGS` | JSON tool args sent on every call |
| `MCP_<LABEL>_MAPPER` | `config` or `llm` (auto-detects from `MAPPING`) |
| `MCP_<LABEL>_MAPPING` | JSON: `{user_id, timestamp, kind, id?, payload?}` field paths |
| `MCP_<LABEL>_HINT` | one-line description, fed to the LLM mapper |
| `MCP_<LABEL>_PASS_DATE_RANGE` | `true` to pass `since`/`until` to the tool args |

#### Mappers

- **`config`** (deterministic): supply field paths in `mapping`. Paths use a tiny JSONPath dialect — `$.a.b`, `$.a[0].b`, or plain dotted (`a.b`). Records with unknown `kind` are dropped silently. No LLM cost.
- **`llm`** (default when `mapping` is absent): the model converts arbitrary records to events that match our schema. Costs a few cents per backfill; useful when records don't fit clean field paths.

`kind` must map to one of the predefined event kinds (`subscription.*`, `payment.*`, `usage.*`, `support.*`, `error.*`, `review.submitted`). For `config` mode this means either a literal kind in `mapping.kind` (`"kind": "support.ticket_open"`) or a field path that already returns one of those values.

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

## License

MIT
