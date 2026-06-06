# retention-brain

A per-user retention agent for subscription apps. Reads each user's full timeline across your tools (Stripe, PostHog, Sentry, RevenueCat — any MCP server), scores churn risk per user, and writes a briefing of personalized retention plays — channel, offer, timing, and the email copy itself, drafted to reference what *that* user actually did.

**Operator's analyst, today. Operator, soon.** Existing subscription tooling tells you what happened (Mixpanel, your billing dashboard, the AI assistant embedded in it) or lets you build flows yourself (Customer.io, Braze). v1.0 of this brain decides what to do per user, drafts the email, and hands it back for you to send. v1.1 graduates to actually sending it, one channel at a time, as the agent earns your trust.

**Two gradients you control:**
- **Sources:** Start with one key — any MCP-shaped source is enough (Stripe, RevenueCat, PostHog, Sentry, or anything else with an MCP server). Add more as you want richer signal.
- **Trust:** Start at briefing-only. Promote to approve-each, then per-channel autonomy, then policy-based autonomy. You decide when each step is earned.

See [`ARCHITECTURE.md`](./ARCHITECTURE.md) for the mental model behind both gradients. [`PRODUCT.md`](./PRODUCT.md) and [`SPEC.md`](./SPEC.md) are the full design.

## Install in 3 minutes

```sh
git clone https://github.com/<you>/retention-brain && cd retention-brain
pnpm install

pnpm retb init       # interactive setup — writes .env + a sources template
pnpm retb run        # writes briefing-<date>.md
```

Edit `.retention-brain/mcp.json` to point at your tools (Stripe, PostHog, Sentry, RevenueCat, anything with an MCP server). [`examples/mcp.json`](./examples/mcp.json) is a working template.

## What's in a briefing

Two flavors of intervention, from the same signal foundation:

- **User-play** — per at-risk user: why they're at risk (which signals fired, with their actual events as evidence), a recommended play (channel, offer, timing), and the email copy itself — drafted to reference what *that* user did, not a template.
- **Engineering-play** — per crash-driven user: a Markdown stabilization ticket written to `engineering-tickets/<date>-<user_id>-<slug>.md` with title, severity, crash evidence, proposed investigation, and a likely-fix direction. No Linear/Jira required; pipe the files into whatever workflow you already use.

A sample briefing with real LLM-drafted copy lives at [`examples/briefing-sample.md`](./examples/briefing-sample.md); the engineering-tickets folder it references lives at [`examples/engineering-tickets/`](./examples/engineering-tickets/).

## Real eval numbers

The risk engine is tested on a held-out seed with pre-registered thresholds (no median-of-churners p-hacking). Real numbers from the test suite:

```
threshold=0.4   precision=0.698   recall=0.757
threshold=0.5   precision=0.709   recall=0.746
threshold=0.6   precision=0.606   recall=0.228
```

[`ARCHITECTURE.md §4`](./ARCHITECTURE.md#4-risk-engine-hybrid-heuristic--llm-judge) explains the eval methodology (train/eval seed split, non-self-judging critic, explicit `llm_judge_available` field).

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

`.retention-brain/mcp.json`:

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

## Webhook layer (for Stripe + RevenueCat)

The official Stripe and RevenueCat MCPs don't expose a "list events between dates" tool — only per-customer queries. To get the `payment_health` signal (which dominates churn prediction) the brain needs a forward-capture mechanism.

`retb webhook-listen` starts a small HTTP receiver that catches Stripe + RevenueCat webhooks and appends them to `.retention-brain/events.jsonl` already in the brain's event schema. A second built-in command, `retb events-mcp-server`, fronts the same file as a stdio MCP. You wire it into `.retention-brain/mcp.json` like any other source.

```sh
pnpm retb webhook-listen --port 4044
# point your billing dashboards at
#   https://<your-public-host>/webhooks/stripe
#   https://<your-public-host>/webhooks/revenuecat
```

In `.retention-brain/mcp.json`:

```json
{
  "label": "webhook-events",
  "command": "pnpm",
  "args": ["retb", "events-mcp-server", "--store", ".retention-brain/events.jsonl"],
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
export REVENUECAT_WEBHOOK_SECRET=...     # the shared-secret you paste in RevenueCat's webhook config
```

Without either, the receiver accepts unsigned payloads — handy for sandbox tests, not for production.

### Giving Stripe + RevenueCat a public URL

`webhook-listen` binds to a local port — fine for testing on your machine. Stripe and RevenueCat need to POST from the public internet, so production setups need a reachable URL pointing at port 4044. Three real options, no code changes:

**1. Tunnel (free, 30 seconds)** — for solo dev, hobby, demos:

```sh
# Cloudflare Tunnel (recommended — no account required for quick tunnels)
cloudflared tunnel --url http://localhost:4044
# prints a public https://<random>.trycloudflare.com URL

# Or ngrok
ngrok http 4044
```

Paste the printed URL + `/webhooks/stripe` into Stripe's webhook config, and `/webhooks/revenuecat` into RevenueCat's. Tunnels die when the laptop closes — fine for testing, not for prod.

**2. VPS / PaaS deploy (~$3–5/mo)** — real production:

The receiver is a plain Node server. Drop it on any host:

```sh
# fly.io
fly launch --name your-retb-webhooks
# accept the defaults; fly auto-generates a Dockerfile that runs `pnpm retb webhook-listen --port $PORT`
fly secrets set STRIPE_WEBHOOK_SECRET=whsec_... REVENUECAT_WEBHOOK_SECRET=...
fly deploy
```

Same shape on Railway, Render, Heroku, or a $5 DigitalOcean droplet behind Caddy. Whatever runs Node.

**3. Serverless (Vercel / Cloudflare Workers)** — $0 typically:

The current receiver uses `node:http` so it doesn't drop into a Vercel function as-is. If you want zero-infra, copy the body-mapping + storage logic into an API route and persist to a managed store (Vercel Blob, KV, or a hosted Postgres). About 50 lines of glue. Open an issue if you'd like a worked example.

**Important:** wherever you deploy, set `STRIPE_WEBHOOK_SECRET` and `REVENUECAT_WEBHOOK_SECRET` so signature verification is enforced. Without them, anyone who finds your URL can write fake events to your briefing.

## License

MIT
