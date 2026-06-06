# retention-brain — Technical Spec

A continuous, per-user retention agent for subscription apps. Reads each user's full timeline across the tools that produce signal (Stripe, PostHog, Sentry, RevenueCat, or any MCP server), scores churn risk per user, and produces two flavors of intervention: drafted retention copy for the user, and Markdown stabilization tickets for the dev. v1.0 stops at writing artifacts to disk; v1.x graduates to executing them.

For the design philosophy and framework decisions, see [`ARCHITECTURE.md`](./ARCHITECTURE.md). For the install path, see [`README.md`](./README.md). This document covers the concrete deliverables, schemas, quality bars, and phase plan.

---

## Status

- **Current version:** v0.1.0 tagged. Full agent loop runs end-to-end on synthetic data with passing evals.
- **Live-data path (MCP):** Four typical sources (Stripe, PostHog, Sentry, RevenueCat) are wired via their MCP servers — no vendor SDKs in the dependency graph. Webhook receiver (Stripe HMAC + RevenueCat shared-secret verification, both `timingSafeEqual`) handles Stripe + RevenueCat forward-capture for `payment.failure` and other events the official MCPs don't expose as batch tools.
- **Eval methodology:** Train/eval seed split, pre-registered thresholds (0.4, 0.5, 0.6), non-self-judging critic (different model for compose vs critique). Reported numbers (synthetic held-out seed): precision 0.698 / recall 0.757 at threshold 0.4.
- **Outputs:** Markdown briefing (`briefing-<date>.md`) + engineering-tickets (`engineering-tickets/<date>-<user_id>-<slug>.md`) when crash signals warrant.

---

## Quality bars

These are gates that have to be met before a version tag is cut. No release should ship without all of these being green for that version.

### v1.0 quality bars

- [x] All `*.test.ts` files green in CI (heuristic-only path; live LLM tests skip cleanly without API key)
- [x] All live LLM tests pass locally with `ANTHROPIC_API_KEY` or `OPENAI_API_KEY` exported
- [x] Risk engine reports precision ≥ 0.65 and recall ≥ 0.70 at threshold 0.4 on the held-out seed
- [x] Intervention critic produces avg ≥ 4/5 on the rubric for synthetic personas with clear signals
- [x] LLM judge handles paid-but-not-using and crashes-then-silence patterns correctly (prompt-tested against contradiction-prone cases)
- [x] `examples/briefing-sample.md` is a non-trivial, end-to-end sample showing the operator-tier output (user-plays + engineering-plays + critic verdicts)
- [x] `pnpm retb init` writes a valid `.env` and `.retention-brain/mcp.json` interactively
- [x] `pnpm retb run` produces a usable briefing in under 10 minutes on a freshly-cloned machine with configured MCP sources (verified end-to-end against live sandbox MCPs in ~4 minutes)
- [x] Webhook receiver enforces signature verification when `STRIPE_WEBHOOK_SECRET` / `REVENUECAT_WEBHOOK_SECRET` are set (fails closed)
- [x] No vendor SDK imports anywhere in `packages/sources*` (MCP-only architecture preserved)

### v1.1 quality bars (planned — "the operator" milestone)

- [ ] `retb approve` walks each pending intervention; user can approve, edit (`$EDITOR`), skip, or quit
- [ ] Three execution channels live, with per-channel test mode as the default-default:
  - **Email** via Resend (behind `RESEND_MODE=test|live`)
  - **Push** via OneSignal or FCM (behind a similar test-mode flag)
  - **In-app native offer** — issuing StoreKit / Play Billing discounts or trial extensions via your billing platform's API (e.g. RevenueCat's API, Stripe's customer portal, or any other vendor that fronts the underlying store APIs)
- [ ] `.retention-brain/outcomes.jsonl` ledger captures every send / skip / mark, append-only, schema-stable across versions
- [ ] Next briefing includes a "Since last briefing" panel populated from the ledger
- [ ] `retb sync-tickets --target=<github|linear|none>` (optional adapter) pipes the engineering-tickets folder to whatever the user already uses

---

## Architecture summary

For the full design, read [`ARCHITECTURE.md`](./ARCHITECTURE.md). The short version:

```
                ┌─────────────────────────────────────────────┐
                │  Sources (MCP servers, plus webhook MCP)    │
                │  Stripe · PostHog · Sentry · RevenueCat ·   │
                │  any other MCP-shaped data source            │
                └────────────────────┬────────────────────────┘
                                     │  normalized Event[]
                                     ▼
                  ┌────────────────────────────────┐
                  │       Risk Engine              │
                  │  6 heuristic signals           │
                  │  + LLM judge (narrative)       │
                  │  → RiskScore + top signals     │
                  └─────────────┬──────────────────┘
                                │  per-user RiskScore
                                ▼
                  ┌────────────────────────────────┐
                  │      Intervention Agent        │
                  │  • user-play sub-pipeline:     │
                  │     channel → offer → timing   │
                  │     → compose → critic         │
                  │  • engineering-play:           │
                  │     crash-driven users get a   │
                  │     stabilization ticket       │
                  └─────────────┬──────────────────┘
                                │
                  ┌─────────────┴──────────────┐
                  ▼                            ▼
        briefing-<date>.md         engineering-tickets/
        (Markdown briefing with    <date>-<user_id>-<slug>.md
         user-plays inline)        (per-user stabilization
                                    tickets, severity-ranked)
```

Source-agnostic event schema is the contract that holds the system together. Every connector — synthetic, MCP-backed, webhook-backed — produces events matching the same shape, which means new sources slot in without touching the risk engine or intervention agent.

---

## Core schemas

The three load-bearing types live in `packages/core/src/`.

### `Event`

```ts
{
  id:        string
  user_id:   string
  kind:      "subscription.purchase" | "subscription.renewal" | "subscription.cancel" |
             "subscription.refund" | "subscription.trial_start" | "subscription.trial_end" |
             "payment.success" | "payment.failure" | "payment.retry" |
             "usage.session" | "usage.feature" |
             "support.ticket_open" | "support.ticket_message" | "support.ticket_close" |
             "error.client" | "error.crash" |
             "review.submitted"
  timestamp: ISO-8601 string
  source:    "synthetic" | "revenuecat" | "stripe" | "mixpanel" | "sentry" |
             "crisp" | "posthog" | "firebase" | "mcp"
  payload:   Record<string, unknown>
}
```

### `RiskScore`

```ts
{
  user_id:              string
  score:                number          // [0, 1], 0.8 * heuristic + 0.2 * llm_judge
  top_signals:          Signal[]        // top 3 contributing, by score * weight
  narrative:            string          // 1-sentence explanation
  llm_judge_available:  boolean         // false if the judge call failed
}
```

### `Intervention` (user-play)

```ts
{
  user_id:        string
  risk_score:     number
  channel:        "email" | "push" | "in_app" | "dunning_fix" | "no_op"
  offer: {
    kind:         "discount_percent" | "discount_amount" | "extension_days" |
                  "upgrade_incentive" | "feature_unlock" | "none"
    value?:       number
  }
  timing:         "immediate" | "next_session" | "within_24h" | "before_renewal"
  copy: {
    subject?:     string         // omitted for push / in_app
    body:         string         // ≤ 800 chars
  }
  reasoning:      string         // "channel: X | offer: Y | timing: Z"
  predicted_lift: { direction, confidence, note }
  critique?:     {                // from non-self-judging critic
    scores: { relevance, personalization, tone, plausibility }  // each ∈ [1, 5]
    notes:  string
    recommendation: "accept" | "revise" | "reject"
  }
}
```

### `EngineeringTicket` (engineering-play)

```ts
{
  user_id:   string
  filename:  string               // suggested file name
  markdown:  string               // full ticket body to write
  copy: {
    title:           string
    summary:         string
    proposed_action: string
    fix_direction?:  string       // LLM-inferred root-cause guess
    severity:        "low" | "medium" | "high"
  }
}
```

---

## Build phases (what shipped, in implementation order)

### Phase 0 — Core types + synthetic source
Define the normalized `Event` schema. Implement a synthetic event generator with ≥6 personas (Loyal, Wavering, Lapsing, Fresh, Power, Crashy-Loyal, Silent-Lurker) and ground-truth labels for eval.

### Phase 1 — Risk engine
Six heuristic signals (`usage_decline`, `payment_health`, `support_sentiment`, `lifecycle_stage`, `engagement_recency`, `error_rate`), each with score / weight / reason. LLM judge for narrative reasoning. Combined score: `0.8 * heuristic + 0.2 * judge`. Quality bar: ≥ 65% precision at 50% recall on held-out synthetic.

### Phase 2 — Intervention agent
Sub-agent pipeline: `decide-channel` → `decide-offer` + `decide-timing` (parallel) → `compose` → `critic`. Each step is a typed `generateObject` call. Critic uses a different model than composer to break self-judging loops. Quality bar: avg ≥ 4/5 on the eval rubric for synthetic personas.

### Phase 3 — Briefing renderer + CLI
`renderBriefing()` produces the Markdown briefing. CLI commands: `init`, `run`, `demo`, `eval`, `webhook-listen`, `events-mcp-server`. `init` is interactive (validates keys, refuses to overwrite an existing `.env`).

### Phase 4 — Eval methodology fixes
Train/eval seed split, pre-registered thresholds (no median-of-churners p-hacking), non-self-judging critic, `llm_judge_available` tracked as explicit field (not silently substituted on failure).

### Phase 5 — MCP-only source adapter
Universal MCP source adapter (`@retention-brain/sources-mcp`). Every source is declared in `.retention-brain/mcp.json` with `command` (stdio) or `url` (http), a `tool` name, and an optional `mapper` (`config` for field-path mapping, `llm` for arbitrary-record-to-event conversion). No vendor SDKs anywhere in the codebase.

### Phase 6 — Webhook receiver
Plugs the gap in Stripe + RevenueCat MCPs that lack batch event-by-date-range tools. `retb webhook-listen` accepts `/webhooks/stripe` (HMAC SHA256 with `timingSafeEqual`) and `/webhooks/revenuecat` (shared-secret bearer auth). Captures events to `.retention-brain/events.jsonl`. A companion `retb events-mcp-server` fronts the same file as a stdio MCP, so the brain reads webhook-captured events through the same MCP interface as everything else.

### Phase 7 — Engineering-play
Detection: a user is eligible for an engineering-play when `error_rate` is in their top signals OR they hit 2+ crashes in the last 14 days. The agent drafts a stabilization ticket (title, summary, severity, proposed action, optional fix direction), writes it as Markdown to `engineering-tickets/<date>-<user_id>-<slug>.md`, and the briefing renderer references each ticket inline alongside the relevant user.

### Phase 8 — Install polish
`retb init` interactive setup: prompts for LLM provider (Anthropic / OpenAI / skip), captures the API key, writes `.env`, and scaffolds a `.retention-brain/mcp.json` template. Validates that an existing `.env` won't be overwritten without confirmation. The actual MCP source wiring happens by editing `.retention-brain/mcp.json` (the template shows the schema; `examples/mcp.json` is a working multi-source config).

### Eval methodology — synthetic now, real-user later

v1.0 ships temporal-holdout eval **on synthetic data**: the generator emits events with ground-truth churn labels, the risk engine scores at a cutoff date (only seeing train-window events), and the eval suite (`packages/eval/src/prediction.test.ts`) computes precision / recall / F1 against those labels at pre-registered thresholds. The README's `precision 0.698 / recall 0.757 at threshold 0.4` numbers come from this pipeline running on the held-out `EVAL_SEEDS[0]` seed.

After v1.0 ships, the next eval evidence comes from **real installs on real apps** — anyone who clones the repo and points it at their own Stripe + PostHog + Sentry + RevenueCat (or whatever sources they use) accounts produces a briefing on their actual users. The outcomes ledger (`.retention-brain/outcomes.jsonl`) introduced in v1.1 captures send / skip / mark decisions per user, which then becomes the training signal for the outcome-learning loop in v1.2. The synthetic temporal-holdout stays as the regression-prevention test; real-app outcomes become the quality signal that compounds.

---

## Validation methodology

| Stage | Data source | Goal | Status |
|---|---|---|---|
| v0 | Synthetic event stream with ground-truth labels | Prove the architecture works end-to-end; pass quality bars on heuristic + LLM-judge + intervention pipeline | ✅ shipped |
| v0.5 | Synthetic + adversarial personas, seed split | Trustworthy eval methodology before real-data eval | ✅ shipped |
| v1.0 | Synthetic temporal-holdout (held-out `EVAL_SEEDS[0]` seed, ground-truth labels, pre-registered thresholds) + live MCP sources (Stripe + PostHog + Sentry + RevenueCat) for install + smoke verification | Temporal-holdout numbers on synthetic (precision 0.698 / recall 0.757 at threshold 0.4); live-MCP spot-check produces a valid briefing end-to-end | ✅ shipped |
| v1.1+ | Real-app data from anyone who installs the brain on their own subscription stack | Real users, real interventions sent through the trust ladder, real outcomes accumulating in `outcomes.jsonl` — becomes the training signal for the v1.2 learning loop | planned |

**v1.0 validation evidence (shipped):**
- Synthetic temporal-holdout on the `EVAL_SEEDS[0]` held-out seed: precision 0.698 / recall 0.757 at threshold 0.4 (pre-registered, no median-of-churners p-hacking). The generator emits events + ground-truth labels; the risk engine scores at a cutoff date; the eval suite computes p/r/f1 against the labels. This is the temporal-holdout methodology, just on synthetic-rather-than-real-API data.
- Live-MCP spot-check: on a fresh clone wired to live Stripe + PostHog + RevenueCat MCPs, `retb run` pulls events, scores 99 users, flags 3 at risk, and drafts user-plays + engineering-tickets end-to-end in ~4 minutes.

**Next evidence (v1.1+):** the next quality signal comes from real installs on real subscription apps. Once the trust ladder + send channels land in v1.1, every install starts populating `.retention-brain/outcomes.jsonl` with send / skip / mark decisions. Those outcomes are the training signal for the v1.2 learning loop — they're per-install, accumulating, and unique to that app's user base. The synthetic temporal-holdout stays as a regression-prevention test (CI catches if the risk engine breaks); the real-app outcomes become the quality signal that compounds.

The contract layer (normalized `Event` and `Intervention` types) matches real Stripe and RevenueCat webhook event payloads, so the v0 → v1 transition was "swap source via MCP config," not a rewrite.

---

## Roadmap

- **v0** ✅ — Synthetic-only, four pillars, CLI demo, evals.
- **v0.5** ✅ — Eval methodology fixes (seed split, adversarial personas, pre-registered thresholds, non-self-judging critic).
- **v1.0** ✅ — MCP-only brain with briefing + engineering-tickets, both as Markdown artifacts. 4 typical sources wired (Stripe, PostHog, Sentry, RevenueCat); ≥1 subscription/billing source (Stripe, RevenueCat, or any equivalent MCP-shaped source) required at runtime. Temporal-holdout eval on synthetic data with ground-truth labels (precision 0.698 / recall 0.757 at threshold 0.4). Install in <10 min — verified end-to-end on a fresh clone against live sandbox MCPs.
- **v1.1 — The operator.** Trust ladder Level 1: `retb approve` walks each pending intervention; approved interventions execute. Three execution channels land together so v1.1 is multi-channel from day one:
  - **Email** via Resend (behind `RESEND_MODE=test|live`; test mode is the default-default)
  - **Push** via OneSignal or FCM
  - **In-app native offer** — issuing StoreKit / Play Billing offers via your billing platform's API (RevenueCat, Stripe, or any vendor that fronts the underlying store APIs). This is the most-native retention play possible (no email/push needed; the offer appears natively in-app) and the channel analyst-tier assistants can't easily ship because it's outcome-as-action rather than analysis.

  Outcomes ledger (`.retention-brain/outcomes.jsonl`) appends every send / skip / mark, append-only. Optional `retb sync-tickets` adapter pipes the engineering-tickets folder to Linear / GitHub Issues / wherever. Smaller deferrals also land here: `--watch` mode for continuous polling, `retb doctor` to flag configured-account mismatches.
- **v1.2 — Outcome learning loop.** Training signal from `outcomes.jsonl` feeds back into prompt rubric and signal weights so the agent gets better at this specific app over time. This is the long-term moat — outcome data accumulates per-install and nobody else has it.
- **v1.x — Higher trust levels.** Level 2 (per-channel trust: "auto-send push, ask before email"), Level 3 (per-policy trust: "auto-send offers <20%"), Level 5 (reactive real-time — fires off the existing webhook receiver). Each level is opt-in per channel; revoke any time.

**Adding new sources is NOT a roadmap item.** The MCP-only architecture means a new source (Mixpanel, Amplitude, Crisp, Intercom, Firebase, App Store reviews, whatever ships an MCP server next) is a JSON entry in `.retention-brain/mcp.json` — no new package, no new version. Source coverage grows as users want it, independently of the trust-and-execution roadmap above.

### Hosted service: open question, not on the active roadmap

A managed-hosted version ("plug in your Stripe / RevenueCat / PostHog keys on a website, briefings show up without running anything yourself") would solve a real friction: not every operator wants to maintain a webhook server, a cron job, or a CLI workflow. But it adds significant infra complexity, single-tenancy assumptions, and a billing surface that this project does not currently have. It is recorded as an open question that could be answered by real-install demand, not a committed milestone.

---

## Quality principles

- **No marketing language in the README.** Thesis-first, code second, no hype.
- **Every component has a rubric.** "Good intervention" is defined in `packages/eval/src/rubric.md`, not vibes.
- **Evals are CI-enforced.** Quality regressions can't ship.
- **Architecture is extensible by design.** Adding a new signal / channel / source is one folder, no surgery.
- **Demo is reproducible.** One command, deterministic seed, lives forever.
- **Failure modes are visible, not papered over.** When the LLM judge fails or returns something low-confidence, the `RiskScore` reflects it explicitly. When the critic disagrees with the composer, the verdict shows up in the briefing.

---

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Synthetic data feels toy-ish | Personas grounded in real subscription patterns; ground-truth labels make evals legitimate; temporal-holdout on the held-out synthetic seed is the v1.0 eval bar (real-sandbox temporal-holdout is v1.1) |
| Risk engine is just heuristics with extra steps | LLM judge does narrative reasoning over the timeline — that's the genuine differentiation. `llm_judge_available` makes the contribution visible per-user. |
| Intervention agent outputs feel generic | Critic sub-agent pass; rubric enforces personalization; anti-slop system prompts ("no emojis, no clickbait subjects") |
| Engineering-play is too AI-slop to be useful | Tickets reference actual crash events from the timeline; the "fix direction" field is explicitly LLM-inferred and flagged as such; the dev is expected to verify before shipping |
| Project drifts into perpetual side-project | Each phase has a deliverable; evals provide objective "is this good yet" signal |
| `--send` (v1.1) accidentally fires real emails | Default `--dry-run`; `--send` requires explicit opt-in; Resend test mode is default-default |
| LLM judge mis-classifies paid-but-not-using as "low risk" | Prompt explicitly names this pattern and forces the judge to compute days-since-last-session; documented as a known failure mode in ARCHITECTURE.md §4 |

---

## What we're explicitly NOT doing (to keep scope honest)

- Multi-tenant hosted infra
- Auth, billing, accounts (the brain is a local CLI, not a SaaS)
- A web UI / dashboard — the Markdown briefing IS the UI; `briefing-view.html` is an optional navigable view, not the primary surface
- Real-time push send in v1.0 — briefing + engineering-tickets are written to disk; the human executes
- Linear / Jira native integration in v1.0 — Markdown files in `engineering-tickets/` are the open ticket format; a `retb sync-tickets` adapter is v1.1 territory
- Outcome learning loop in v1.0 — the ledger captures data; the loop that uses it is v1.6

---

## What v1.0 shipped — verification checklist

The v1.0 tag goes out when all of these are true. As of the v0.1.0 commit, these are the verified gates:

- [x] Clone → first useful output on real MCP sandboxes in under 10 minutes (verified end-to-end against live Stripe + PostHog + RevenueCat MCPs in ~4 minutes)
- [x] README is install-first; the operator-vs-analyst framing fits in the second paragraph
- [x] Temporal-holdout eval suite passes on synthetic with ground-truth labels (precision 0.698 / recall 0.757 at threshold 0.4 on the held-out `EVAL_SEEDS[0]` seed, pre-registered thresholds) and spot-checks correctly on real-MCP sandbox data (3 of 3 flagged users get valid interventions)
- [x] Briefing renders correctly with both user-plays and engineering-tickets populated when signals warrant
- [x] Webhook receiver enforces signature verification when `STRIPE_WEBHOOK_SECRET` / `REVENUECAT_WEBHOOK_SECRET` are set; rejects unsigned requests by default; documented fail-open behavior when secrets are deliberately omitted (sandbox testing only)
- [x] Repo has CI green on `main`, MIT license, working `examples/` (`briefing-sample.md`, `engineering-tickets/`, `mcp.json`, `synthetic-events.jsonl`)

Deferred to v1.1 (not blocking v1.0):

- `--watch` mode (continuous polling between `run` invocations) — `run` ships as one-shot in v1.0; `--watch` is cron-script-shaped today (`*/15 * * * * cd repo && pnpm retb run`), v1.1 wraps it as a native flag
- `retb doctor` diagnostic — currently a manual exercise (run `retb run`, inspect the per-source event counts, check `.env` against the active accounts in each dashboard)
- `CONTRIBUTING.md` — community process docs land when the project earns its first external contributor
