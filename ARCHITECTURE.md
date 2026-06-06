# Architecture & Design Philosophy

This document explains *why* `retention-brain` is shaped the way it is. The code shows what it does; this document shows the mental model behind the decisions. Read this first if you want to understand the project's center of gravity in five minutes.

## TL;DR

Four framework moves drive everything below:

1. **Operator, not analyst.** Existing subscription tooling tells you what happened (Mixpanel, your billing dashboard, the AI assistant embedded in it) or lets you build flows (Customer.io, Braze). This brain *decides what to do per user, in writing, ready to send*. v1.0 stops at "draft the action"; v1.x graduates to executing it.
2. **Two-axis flexibility — sources × trust.** Users move along two independent gradients: how many data sources they wire up (1 → 4 → N), and how much autonomy the agent earns (briefing-only → autonomous-with-audit). Most retention tools force you into a single corner of this grid. This brain runs at every corner.
3. **MCP everywhere.** Every external data source is an MCP server, called by tool name with arguments. No vendor SDKs in the dependency graph. Adding a fifth source is a JSON config entry, not a new package.
4. **Two flavors of intervention.** Not every signal calls for an email to the user. When the signal is `error.crash`, the right action is a stabilization ticket for the dev (the same person, on a one-person team). The agent produces *user-play* (drafted retention copy) AND *engineering-play* (Markdown stabilization tickets written to `engineering-tickets/`) from the same signal foundation.

The rest of this doc is each move in more detail.

---

## 1. Operator, not analyst

The mental model that makes everything else make sense.

**Analyst-tier products** (Mixpanel, every "AI assistant for X dashboard" — including the ones embedded in billing tools) tell you what happened and recommend what to do. The user — a human — still has to translate insight into action: open a different tool, write the email, decide who to send to, pick a discount, hit send.

**Operator-tier products** do the work. They know what happened, decide the channel and offer and copy, and either send it directly or hand the human a one-click approve flow.

The gap between these is wider than it looks. The current generation of dashboard-embedded AI assistants positions itself explicitly as analyst-tier — "an advisor, not a search bar" is the typical framing. The brain fills the operator-tier gap — but it doesn't claim to be the operator on day one. It claims to be **the operator's analyst on day one**, with the operator landing in v1.1.

Why split it that way: the trust ask is the hard part. Letting an agent draft 5 emails per week and asking the human to send them is a small ask. Letting an agent autonomously email your paying users is a *large* ask. v1.0 earns the right to ask the larger version by getting the smaller version right first.

### What v1.0 is (briefing-only)

```
[Sources via MCP] → [Risk engine] → [Intervention agent] → briefing-<date>.md
                                                            └─ (human reads, sends manually)
```

### What v1.1 is (Level 1 trust, multi-channel from day one)

```
[Sources via MCP] → [Risk engine] → [Intervention agent] → [Outcomes ledger]
                                          ↓
                                   `retb approve`
                                          ↓
                  ┌───────────┬───────────┬──────────────────────────┐
                  ↓           ↓           ↓                          ↓
              [Email]      [Push]      [In-app native offer]     (more channels
              Resend     OneSignal /   StoreKit / Play Billing      slot in via
                            FCM          (via your billing           the same
                                          platform's API)             dispatcher)
```

All three execution channels land together so v1.1 is multi-channel from the moment any send happens. The in-app native offer channel (a StoreKit / Play Billing discount or trial extension surfaced via whichever billing platform you use) is the most-native retention play — no email or push needed; the offer appears in-app — and it's the one analyst-tier assistants can't easily ship because it's outcome-as-action rather than analysis.

### What v1.x is (Levels 2–5)

Per-channel trust ("auto-send push, ask before email"). Per-policy trust ("auto-send discounts under 20%"). Reactive real-time send wired off the webhook receiver. Each level is opt-in per-channel per-source; revoke any time.

---

## 2. Two-axis flexibility: sources × trust

Most retention tools commit you to a fixed shape upfront. Customer.io is "all sources up front, flow-builder UI, autonomous from setup." Dashboard-embedded assistants are "single-vendor, recommend-only." The brain runs at every corner of this grid:

```
                  Sources wired
              1 key ────────────► 4 keys (and beyond, via MCP)
              any one source      Stripe + RevenueCat + Sentry +
              (minimum)           PostHog + ... (cathedral)
Trust level
Level 0 ──┐   Briefing on one    Briefing across all signals
brief     │   source alone, ~2    — usage decline, error rate,
only      │   min install         payment health, support tone
          │
Level 1   │   Approve-each on    Approve-each across all channels
          │   events from one
          │   source
Level 5   │   Autonomous on      Autonomous reactive operator
auto      │   single-source      across the whole signal surface
real-time │   retention
          ▼
```

Why this matters operationally:

- **A first-time installer** pastes one API key (Stripe, RevenueCat, PostHog — any MCP-shaped source), sees a briefing in two minutes, and stays at Level 0 indefinitely. Zero commitment.
- **A motivated indie dev** adds two or three more sources over the next week as they read more signal types in the briefing.
- **A power user** earns trust to Level 2 on the `push` channel (low-stakes nudges) while staying at Level 1 on `email` (higher-stakes copy goes through human review).

The implementation cost of supporting all corners is low because the trust level is enforced at *one place* (the action layer between intervention and channel) and the source set is enforced at *one place* (the MCP loader). Adding corners doesn't multiply complexity.

---

## 3. MCP-only source architecture

There is no vendor-specific code in this repo. No `@revenuecat/sdk` import, no Stripe API client, no PostHog HTTP wrapper. Every source is an MCP server, called via the standard MCP Client interface (stdio or HTTP).

### Why

- **Zero per-vendor maintenance.** When Stripe deprecates an endpoint or RevenueCat ships a new field, the upstream MCP server handles it. The brain doesn't care.
- **Source 5+ is a JSON config entry.** Wiring a new source = add an object to `.retention-brain/mcp.json` with `command`/`url`, `tool`, `mapper`, and an optional `hint`. No code.
- **Composes with everything.** Anything that ships an MCP server is automatically a usable source — including tools that don't exist today.
- **Aligns with where the industry is going.** MCP became the assumed integration interface for AI agents in 2025. By 2027 every serious SaaS will have an MCP server. This codebase was built for that future from day one.

### What it costs

- Two of the official MCPs (Stripe, RevenueCat) don't yet expose batch event-by-date-range tools — only per-customer queries. The brain plugs the gap with its own `webhook-receiver` package: a small HTTP server that catches Stripe + RevenueCat webhooks, stores them in `.retention-brain/events.jsonl`, and fronts that file as an MCP server (`retb events-mcp-server`). It's MCP-shaped from the brain's perspective; the file is just the persistence layer.
- The "let an LLM normalize arbitrary records to events" mapper (`mapper: llm` in mcp.json) costs a few cents per backfill. The config mapper (JSONPath-style field paths) costs nothing — used when records fit clean field paths.

### What you wire in `.retention-brain/mcp.json`

```json
{
  "sources": [
    {
      "label": "billing",
      "command": "npx",
      "args": ["-y", "@stripe/mcp@latest", "--api-key=${STRIPE_SECRET_KEY}"],
      "tool": "list_subscriptions",
      "mapper": "llm"
    },
    {
      "label": "subscriptions",
      "url": "https://mcp.revenuecat.ai/mcp",
      "headers": { "Authorization": "Bearer ${REVENUECAT_API_V2_SECRET_KEY}" },
      "tool": "list-customer-purchases",
      "mapper": "llm"
    }
  ]
}
```

Adding a sixth source is one more entry. Adding the seventh is one more entry.

---

## 4. Risk engine: hybrid heuristic + LLM judge

Per-user churn risk in `[0, 1]`, with the top three contributing signals and a one-sentence narrative.

```
[UserTimeline] → [6 heuristic signals] ─┐
                                        ├→ weighted sum → combined risk
                  [LLM judge (Opus)]   ─┘                  + top signals
                                                           + narrative
```

Six heuristic signals (each returns `score`, `weight`, `reason`):

| Signal | Weight | What it captures |
|---|---|---|
| `usage_decline` | 0.35 | Recent session count vs early-window baseline |
| `payment_health` | 0.40 | Unrecovered payment failures |
| `engagement_recency` | 0.35 | Days since last session |
| `error_rate` | 0.05 | Crashes in the last 14 days |
| `support_sentiment` | 0.05 | Negative-leaning support tickets |
| `lifecycle_stage` | 0.00 | Currently non-discriminating |

Weights live in each signal file with rationale comments. The LLM judge does *narrative* reasoning over the timeline — pattern recognition heuristics can't easily express (e.g., "user explored 5 features then hit a crash and went quiet"). Combined score: `0.8 * heuristic + 0.2 * llm_judge_score`.

### Three eval-methodology choices that matter

1. **Train/eval seed split.** Different deterministic seeds for weight tuning vs reporting numbers. No retroactive p-hacking on the same data the weights were tuned against.
2. **Pre-registered thresholds.** Performance is reported at fixed thresholds (0.4, 0.5, 0.6) — not the median-of-churners or other data-dependent picks. Real numbers from the held-out test:
   ```
   threshold=0.4   precision=0.698   recall=0.757
   threshold=0.5   precision=0.709   recall=0.746
   threshold=0.6   precision=0.606   recall=0.228
   ```
3. **Non-self-judging critic.** The intervention critic uses a *different model* than the composer (Opus 4.7 critic + Sonnet 4.6 composer in Claude mode; GPT-4o critic + GPT-5 composer in OpenAI mode). Breaks the same-model-judges-itself failure mode.

`llm_judge_available` is tracked as an explicit field on every `RiskScore`. If the judge fails, the score doesn't silently fall back to a substituted zero — it falls back to heuristic-only and the field reflects that. Failure modes are visible to the eval suite.

### Known LLM-judge weaknesses (and the fixes shipped)

The LLM judge has documented failure modes. They are kept explicit rather than papered over.

- **Paid-but-not-using.** Earlier judge prompts called a "successfully renewed but no recent sessions" pattern *low risk*, when it is actually one of the strongest churn signals (the user is paying by inertia and will likely cancel at the next renewal). The judge prompt now explicitly names this pattern as HIGH risk, names `subscription.renewal` and `payment.success` as billing events (not engagement), and instructs the judge to compute days-since-last-session explicitly. Re-evaluated on the briefing-sample seed: the pattern is now correctly flagged.
- **Crashes + silence.** A user who hits one or more `error.crash` / `error.client` events and then goes quiet often gets called "stable" by a naive judge because the absence of further negative signal reads as recovery. The prompt now names this pattern explicitly as HIGH risk.

These are the kind of mistakes a generic LLM-as-judge will make on a 30-event timeline without domain priors. The prompt carries those priors so the judge doesn't have to rediscover them.

---

## 5. Intervention agent: specialist sub-agents + critic

For each user above the risk threshold, the agent produces a structured `Intervention { user_id, channel, offer, timing, copy, reasoning, critique }`. The flow:

```
RiskScore + UserTimeline
        │
        ▼
[decide-channel] ─── if no_op, skip user
        │
        ▼
[decide-offer]  ║  parallel (independent decisions)
[decide-timing] ║
        │
        ▼
[compose]   ── writes subject + body using risk + channel + offer
        │
        ▼
[critic]    ── scores 4 dimensions, recommends accept/revise/reject
        │
        ▼
Intervention written to briefing
```

Each step is a typed `generateObject` call against a Zod schema. The schema constrains the LLM to enums and length limits — composer can't return a 5000-char body, channel can't be invented, offer kind is a closed enum. The prompts emphasize anti-slop ("no emojis unless absolutely natural; no clickbait subjects"). The critic uses a senior-retention-PM voice and scores on four explicit dimensions (relevance, personalization, tone, plausibility), recommending revise if avg ∈ [3, 4) and reject if avg < 3.

---

## 5.1. Two flavors of intervention: user-play and engineering-play

Not every signal is best addressed by talking to the user. When a user's top-driver signal is `error.crash` — three crashes in two weeks, then they went quiet — emailing them an apology doesn't fix the underlying bug, and the next user who hits the same crash will churn the same way. The right intervention is engineering, not marketing: investigate the crash, propose a stabilization plan, raise a ticket.

The agent produces two flavors of intervention from the same signal foundation:

- **user-play**: drafted copy aimed at the at-risk user. Channel, offer, timing, body. The `Intervention` schema covered in §5.
- **engineering-play**: a structured stabilization ticket aimed at the dev (the same person, for indie / small-team users). When a user has `error_rate` in their top signals OR 2+ crashes in the last 14 days, the agent drafts a Markdown ticket with: title, summary, severity, crash evidence, proposed investigation steps, and a likely fix direction. The ticket is written to `engineering-tickets/<date>-<user_id>-<slug>.md` and referenced from the main briefing.

### Why Markdown files (not Linear / Jira)

The user is typically a one- or two-person team. They don't have a separate engineering ticketing system, and they don't want one. Markdown files in a folder are:

- **Greppable, diffable, version-controllable.** They survive without infrastructure.
- **Pipe-able to whatever workflow you actually use.** Each `.md` file is structured enough that a follow-up script can convert it to a Linear issue, a GitHub PR description, a `gh issue create` call, or just sit in the folder as the canonical record.
- **Zero vendor lock-in.** No API key, no auth, no rate limit.

```
engineering-tickets/
  2026-05-08-user_28-investigate-export-pdf-crashes.md
  2026-05-08-user_51-payment-failure-after-export-crash.md
```

The renderer mentions these tickets at the top of the briefing ("3 stabilization tickets in `./engineering-tickets/`") and links to them from the relevant per-user blocks. A future workflow (e.g., `retb sync-tickets --target=linear`) can map them onto whatever issue tracker is in play. v1.0 stops at the Markdown layer.

### When each fires

```
user has crash signal?   ───►  engineering-play  (always, for crash-driven users)
user is at retention risk? ─►  user-play         (when channel ≠ no_op)
both?                       ►  both, side-by-side in the briefing
```

The two are produced independently — the engineering-play doesn't block on the user-play, and vice versa. A user who has both gets both surfaced; a user who has only crashes (no retention email warranted) gets only the engineering ticket.

---

## 6. Webhook receiver: filling the gap Stripe and RevenueCat don't

Both official MCPs return per-customer queries but not "list events between dates." For the brain to score `payment_health` accurately, it needs forward-capture. The `webhook-receiver` package is the answer:

- `retb webhook-listen` starts a small Node HTTP server (Stripe HMAC signature verification + RevenueCat shared-secret comparison, both using `timingSafeEqual`)
- Catches POSTs to `/webhooks/stripe` and `/webhooks/revenuecat`
- Maps them into the brain's normalized `Event` schema and appends to `.retention-brain/events.jsonl`
- `retb events-mcp-server` fronts the same file as a stdio MCP — wired into `.retention-brain/mcp.json` like any other source

The MCP-only architecture stays intact — the webhook layer is just *another MCP* from the brain's perspective. The file is the durable persistence boundary.

Deploy paths covered in the README: Cloudflare Tunnel for solo testing (30 seconds), Fly.io / Railway / Render for production (single Dockerfile), Vercel / Cloudflare Workers for $0 serverless (50 lines of glue noted as future work).

---

## 7. What v1.0 is NOT

This list matters more than the feature list. Each item was considered and intentionally deferred.

- **Send to real users.** v1.0 generates the briefing and writes drafts. The human sends. Resend connector lands in v1.1 with the Level 1 trust ladder.
- **Trust ladder Levels 2–5.** Per-channel trust, per-policy trust, autonomous with audit log, reactive real-time. All architecturally pre-positioned but not implemented.
- **Push channel.** OneSignal or FCM wiring. Higher open rate than email on mobile but more intrusive. Lands in v1.1 alongside the email dispatcher. The `Channel` enum already includes `push`; only the dispatcher is missing.
- **In-app native offer channel.** The most-native retention play — issue a StoreKit / Play Billing discount or trial extension directly via your billing platform's API; appears native in-app, no email/push. Defensible against analyst-tier assistants because it's outcome-as-action, not analysis. Lands in v1.1 alongside email + push (v1.1 ships multi-channel from day one of executable interventions).
- **In-app banner, SMS, Slack DM, WhatsApp Business.** Additional channels available via the same dispatcher interface as user demand surfaces. Not version-tagged — slot in when wanted.
- **Outcome learning loop.** The `outcomes.jsonl` ledger (coming in v1.1 with the approve flow) is the foundation; the loop that uses it to refine prompts and signal weights lands in v1.2.
- **Web UI / dashboard.** CLI + markdown briefings only. The briefing IS the UI. (`briefing-view.html` exists as a navigable view for the markdown but is not the primary surface.)
- **Multi-tenant hosted version.** Runs locally or self-hosted. Hosted is v2.0+ if real-user signal warrants it.

---

## 8. Where this is going

A 12-month projection of the architecture, anchored against the trust ladder and source axes:

| Time | Trust ceiling | Execution channels live | What unlocks |
|---|---|---|---|
| v1.0 (now) | Level 0 (briefing-only) | none — Markdown artifacts only | Two flavors of intervention (user-play + engineering-play); MCP-only sources; eval rigor; outcomes-as-Markdown-files (no Linear/Jira required) |
| v1.1 | Level 1 (approve-each) | Resend email · push (OneSignal / FCM) · in-app native offer (StoreKit / Play Billing, via your billing platform's API) | First operator capabilities land — multi-channel from day one of executable interventions. Outcomes ledger starts. Optional `retb sync-tickets` adapter for the engineering-tickets folder. |
| v1.2 | Same | Same | Outcome learning loop: `outcomes.jsonl` feeds back into prompt rubric and signal weights. The long-term moat — per-install outcome data nobody else has. |
| v1.x | Level 2–5 (per-channel · per-policy · reactive real-time) | Same | Granular autonomy: "auto-send push, ask before email"; "auto-send offers <20%"; reactive sends off the webhook receiver. |

**Source coverage is not version-tagged.** New sources (Mixpanel, Amplitude, Crisp, Intercom, Firebase, App Store reviews — anything with an MCP server) slot in via `.retention-brain/mcp.json` as the user wants them, independently of the trust-and-execution roadmap above. The MCP-only architecture is precisely what makes this possible.

A hosted service (managed-as-a-service for users who don't want to self-host) is an open question, recorded but not committed — it would be answered by real-install demand, not planned ahead of it.

The path is intentional: each version unlocks a new corner of the source × trust grid without rebuilding the architecture. Source 5+ is a JSON entry. Trust Level 2 is a per-channel policy file. v1.6's learning loop reads `outcomes.jsonl` and updates weights — no architectural shift.

---

## 9. The contracts that hold the system together

If you only read three files in `packages/core/src/`:

- `events.ts` — the normalized `Event` schema. Every source must produce events matching this shape (via config mapper, LLM mapper, or webhook normalizer). The Event schema is the contract that makes MCP-based sources interchangeable.
- `intervention.ts` — the `Intervention` schema. What the agent produces; what `retb approve` operates on in v1.1; what the briefing renders.
- `llm.ts` — the provider abstraction. Per-role model routing (creative / structured / critic). Provider auto-detects from env keys. Override with `LLM_PROVIDER`, `LLM_MODEL`, `LLM_CRITIC_MODEL`.

These three schemas + the MCP loader are the load-bearing pieces. Everything else is a transformation between them.
