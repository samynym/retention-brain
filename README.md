# rc-retention-brain

A continuous, per-user retention agent for subscription apps. Reads each user's full timeline across your tools, scores churn risk, and writes a markdown briefing with personalized retention plays — one per at-risk user, with the actual copy ready to send.

## Install in 3 minutes

```sh
git clone https://github.com/<you>/rc-retention-brain && cd rc-retention-brain
pnpm install

pnpm rcrb init       # interactive setup — writes .env + a sources template
pnpm rcrb run        # writes briefing-<date>.md
```

Edit `.rcrb/mcp.json` to point at your tools (RevenueCat, Stripe, PostHog, Sentry, anything with an MCP server). [`examples/mcp.json`](./examples/mcp.json) is a working template.

## What's in a briefing

Per at-risk user: why they're at risk (which signals fired, with their actual events as evidence), and a recommended play — channel, offer, timing, and the email copy itself, drafted to reference what *that* user did. A sample briefing lives at [`examples/briefing-sample.md`](./examples/briefing-sample.md).

For the full design see [`PRODUCT.md`](./PRODUCT.md) and [`SPEC.md`](./SPEC.md).

## LLM provider

Set one API key:

```sh
export ANTHROPIC_API_KEY=sk-ant-...    # uses Claude
# or
export OPENAI_API_KEY=sk-...           # uses GPT
```

Defaults: Claude Sonnet 4.6 (generator) + Claude Opus 4.7 (critic). For OpenAI it's GPT-5 for both. Override with `LLM_PROVIDER`, `LLM_MODEL`, or `LLM_CRITIC_MODEL`. Without a key, the brain still produces heuristic-only briefings; the LLM only enriches narrative and drafts intervention copy.

## Wiring a source

Every source is an MCP server. There's no vendor-specific code — you point us at the server, name a tool, and either supply a field-path mapping or let an LLM convert the output to events.

`.rcrb/mcp.json`:

```json
{
  "sources": [
    {
      "label": "billing",
      "command": "npx",
      "args": ["-y", "@stripe/mcp@latest", "--api-key=${STRIPE_SECRET_KEY}"],
      "tool": "list_subscriptions",
      "mapper": "llm",
      "hint": "Stripe Subscription objects. status=canceled → subscription.cancel."
    },
    {
      "label": "engagement",
      "url": "https://mcp.posthog.com/mcp",
      "headers": { "Authorization": "Bearer ${POSTHOG_PERSONAL_API_KEY}" },
      "tool": "execute-sql",
      "mapper": "llm",
      "hint": "PostHog event stream. session-start → usage.session, others → usage.feature."
    }
  ]
}
```

Or via env vars for a single source:

```sh
export MCP_SOURCES=billing
export MCP_BILLING_COMMAND="npx -y @stripe/mcp@latest --api-key=${STRIPE_SECRET_KEY}"
export MCP_BILLING_TOOL=list_subscriptions
export MCP_BILLING_HINT="Stripe Subscription objects."
```

### Mappers

- **`config`** — supply field paths in `mapping`. Tiny JSONPath dialect: `$.a.b`, `$.a[0].b`, or plain dotted (`a.b`). No LLM cost.
- **`llm`** (default) — the model converts arbitrary records to events. A few cents per backfill; useful when records don't fit clean field paths.

`kind` must be one of `subscription.*`, `payment.*`, `usage.*`, `support.*`, `error.*`, `review.submitted`.

## Webhook layer (for RC + Stripe)

The official RevenueCat and Stripe MCPs don't expose a "list events between dates" tool — only per-customer queries. To get the `payment_health` signal (which dominates churn prediction) the brain needs a forward-capture mechanism.

`rcrb webhook-listen` starts a small HTTP receiver that catches RC + Stripe webhooks and appends them to `.rcrb/events.jsonl` already in the brain's event schema. A second built-in command, `rcrb events-mcp-server`, fronts the same file as a stdio MCP. You wire it into `.rcrb/mcp.json` like any other source.

```sh
pnpm rcrb webhook-listen --port 4044
# point Stripe + RC dashboards at
#   https://<your-public-host>/webhooks/stripe
#   https://<your-public-host>/webhooks/revenuecat
```

In `.rcrb/mcp.json`:

```json
{
  "label": "webhook-events",
  "command": "pnpm",
  "args": ["rcrb", "events-mcp-server", "--store", ".rcrb/events.jsonl"],
  "tool": "list_events",
  "mapper": "config",
  "mapping": {
    "user_id": "$.user_id",
    "timestamp": "$.timestamp",
    "kind": "$.kind",
    "id": "$.id",
    "payload": "$.payload"
  },
  "passDateRange": true
}
```

Signature verification is wired but only enforced if you set:

```sh
export STRIPE_WEBHOOK_SECRET=whsec_...
export REVENUECAT_WEBHOOK_SECRET=...     # the shared-secret you paste in RC's webhook config
```

Without either, the receiver accepts unsigned payloads — handy for sandbox tests, not for production.

## License

MIT
