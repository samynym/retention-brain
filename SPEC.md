# rc-retention-brain — Spec

**Status:** Spec v2 · 2026-05-07
**Pace:** Side project, ~6–7 weekends, no fixed deadline
**Format:** Public open-source GitHub repo (MIT). No web demo, no Loom — the repo is the artifact.
**Positioning:** A continuous, cross-source, per-user retention agent. Built for personal validation; **DM Jacob at v1.0** — when he can install it and run it on a real RC sandbox in under 10 minutes.

---

## Thesis

> *Rico is an excellent **analyst** — ask it about your churn, get a smart answer about your cohorts. The next layer of subscription intelligence isn't an analyst; it's an **operator**. A continuous, cross-source, per-user agent that watches your subscription business in real time and decides — for each at-risk user, individually — what to do.*

Rico's four structural limits define the open territory:

| Rico does | The brain operator does |
|---|---|
| RC data only | Cross-source: RC + Stripe + Mixpanel + Intercom + Sentry |
| Aggregate cohorts | Per-user, real-time |
| Recommend only | Decides + (eventually) executes |
| On-demand (you ask) | Continuous (it watches) |

`rc-retention-brain` is that operator. v0 proves the architecture on synthetic data; v1 makes it real and installable.

## v1 = the DM bar

The DM is sent when v1 ships. v1 means Jacob can:

```
$ npx rc-retention-brain init
> Paste your RC sandbox API key:
> Paste your Stripe sandbox key (optional, recommended):
> Paste your Resend API key (optional, for --send):

$ npx rc-retention-brain run
🧠 Reading RC events: 1,247 active subscribers, last 30d
💳 Reading Stripe events: 1,247 customers matched, payment health computed
📊 Risk engine: 73 users flagged at risk
🤖 Intervention agent: generating plays for top 20…

→ Briefing written to ./briefing-2026-05-07.md
→ 20 intervention drafts in ./interventions/
→ Run with --send to dispatch (default: dry-run)
```

In other words: clone, paste keys, run, get a real retention briefing on a real account in under 10 minutes. Anything less than that and the DM is premature.

**v1 must deliver on all four points of differentiation from Rico:**

| Differentiator | v1 implementation |
|---|---|
| Per-user (vs aggregate) | Risk + intervention generated per subscriber |
| Continuous (vs on-demand) | `--watch` mode that polls events on schedule |
| Cross-source (vs RC-only) | **7 sources:** RC, Stripe, Mixpanel, Sentry, Crisp, PostHog, Firebase Analytics + Crashlytics |
| Action-oriented (vs recommend-only) | Resend connector with `--send`; default `--dry-run` |

**Why 7 sources in v1, not 2:** With Claude Code doing the implementation autonomously, the cost-of-breadth argument is much weaker than for human-paced work. Each connector is ~1-3 hours of agent time. Going wide unlocks the genuine "this brain sees what no other tool sees" narrative — RC for subscriptions, Stripe for payment health, Mixpanel for usage decline, **Sentry for errors-as-churn-signal (the novel angle)**, Crisp for support sentiment, PostHog for indie-modern stack, Firebase for the Android/Firebase-only crowd.

## What ships when

### v0 (synthetic prove-out — Weeks 1–4)

A working CLI on synthetic data:

```
$ npx rc-retention-brain demo

🧠 Loading synthetic stream: 1000 users, 30 days of events
📊 Risk Engine: scoring users… done
   • 47 flagged at risk (>0.70)
   • Top signals: usage decline (28), payment failures (12), support sentiment (7)

🤖 Intervention Agent: generating plays for top at-risk users…

User alice@example.com (risk 0.89)
  Why: 3 weeks declining sessions, opened cancel page yesterday
  Play: in-app · 20% off annual · loss-aversion framing · next session
  Copy: "Hey Alice — we noticed [feature] usage drop. Stay with us, save 20%…"

✅ Eval: predictions hit 78% precision / 65% recall vs synthetic ground truth
   Intervention quality (LLM-judge): 4.2/5 avg
```

Goal of v0: prove the four pillars work end-to-end on synthetic data, with passing evals. No real connectors, no real sends.

### v1 (the DM milestone — Weeks 5–7)

Same CLI, real connectors, real action capability:

- Real **RC connector** (REST API + webhook listener)
- Real **Stripe connector** (REST API + webhook listener)
- Real **Resend connector** for action execution (`--dry-run` default, `--send` opt-in)
- `--watch` mode for continuous polling
- Install path: clone → paste keys → first useful output in <10 min
- README is install-first, thesis-second

## What v1 is NOT

- ❌ No web UI / dashboard (CLI + structured Markdown briefings only)
- ❌ No Mixpanel / Amplitude / Sentry / Intercom connectors (slot in v1.1+ via the same interface)
- ❌ No outcome learning loop (`v1.5`)
- ❌ No multi-tenant / hosted version
- ❌ No action channels beyond email (push, in-app, dunning fixes deferred)

## Architecture

```
rc-retention-brain/
├── README.md                       # Install-first, thesis-second
├── packages/
│   ├── core/                       # Source-agnostic types + interfaces
│   │   ├── events.ts               # normalized event schema (matches RC + Stripe shapes)
│   │   ├── user-timeline.ts        # per-user merged event stream
│   │   └── intervention.ts         # the structured output type
│   │
│   ├── sources/                    # Event ingestion (synthetic or real)
│   │   ├── source.ts               # interface every source implements
│   │   ├── synthetic/              # Simulator (v0)
│   │   │   ├── personas/
│   │   │   ├── ground-truth.ts
│   │   │   └── generate.ts
│   │   ├── revenuecat/             # v1: real RC connector
│   │   │   ├── webhook.ts          # listener
│   │   │   └── api.ts              # backfill via REST
│   │   └── stripe/                 # v1: real Stripe connector
│   │       ├── webhook.ts
│   │       └── api.ts
│   │
│   ├── risk-engine/                # Per-user churn risk
│   │   ├── signals/                # individual extractors (work on normalized timeline)
│   │   │   ├── usage-decline.ts
│   │   │   ├── payment-health.ts
│   │   │   ├── support-sentiment.ts
│   │   │   ├── lifecycle-stage.ts
│   │   │   └── engagement-recency.ts
│   │   ├── llm-judge.ts            # narrative risk reasoning
│   │   └── score.ts                # combined risk + top contributing signals
│   │
│   ├── intervention-agent/         # The decision
│   │   ├── decide-channel.ts
│   │   ├── decide-offer.ts
│   │   ├── decide-timing.ts
│   │   └── compose.ts
│   │
│   ├── channels/                   # Action execution (v1: email-only)
│   │   ├── channel.ts              # interface
│   │   ├── dry-run.ts              # default — writes intervention to disk
│   │   └── resend/                 # v1: real Resend connector
│   │
│   ├── eval/                       # Quality bars
│   │   ├── prediction.ts           # precision/recall vs synthetic ground truth
│   │   ├── intervention.ts         # LLM-as-judge with a rubric
│   │   ├── rubric.md               # versioned, reviewable
│   │   └── report.ts               # markdown eval report
│   │
│   └── cli/                        # `npx rc-retention-brain {demo|init|run|watch|eval}`
│
├── examples/
│   ├── demo-1000-users.json        # canonical synthetic dataset (committed)
│   └── briefing-sample.md          # what a real briefing looks like
│
└── docs/
    ├── architecture.md
    ├── extending.md                # how to add a signal, channel, or source
    ├── rubric.md
    └── roadmap.md
```

## Build order

### v0 phase — synthetic prove-out

**Week 1 — Core types + Simulator**
- Define normalized `Event` and `Intervention` types (match RC + Stripe shapes)
- Synthetic source: ≥6 personas (Loyal, Wavering, Lapsing, Fresh, Power, Lapsed-returning, Free-rider)
- Ground-truth labels (who churns, when, why)
- Eval scaffolding running from day 1 (even before signals exist)

**Week 2 — Risk Engine**
- Per-user score in [0,1] + top 3 contributing signals + 1-sentence narrative
- Hybrid: heuristic signals + LLM judge over user timeline
- **Quality bar:** ≥75% precision @ 50% recall on synthetic ground truth

**Week 3 — Intervention Agent**
- Specialist sub-agents (channel → offer → timing → copy) → composer → critic pass
- Output `Intervention { user_id, channel, offer, timing, copy, reasoning, predicted_lift }`
- **Quality bar:** LLM-as-judge avg ≥4/5 on rubric (relevance, personalization, tone, plausibility)

**Week 4 — Eval polish + v0 CLI**
- `npx rc-retention-brain demo` works end-to-end on synthetic data
- Evals enforced in CI
- v0 tagged

### v1 phase — real connectors + ship (autonomous Claude execution)

Time estimates are now in **agent-hours**, not weekends. With autonomous CC sessions and accounts/keys provisioned upfront, this is plausibly 2-3 focused weekends total wall-clock.

**Phase A — Connector foundation (~3-4 agent-hrs)**
- Generic `Source` interface and `Channel` interface
- Synthetic source kept as canonical reference implementation
- User matching strategy module (email-primary with `app_user_id` metadata fallback, configurable)

**Phase B — All 7 source connectors (~12-18 agent-hrs total, ~1.5-3 hrs each)**
1. **RevenueCat** — REST API + webhook listener. Subscribers, transactions, entitlements, charts data
2. **Stripe** — REST + webhook. Customers, subscriptions, invoices, charge.failed, payment_method events
3. **Mixpanel** — Engage API for user profiles + Events Export for behavior. Activity decline = primary signal
4. **Sentry** — Issues API + user-tied events. *Novel angle: errors as per-user churn predictor*
5. **Crisp** — Conversations API. Sentiment derived from message content via LLM
6. **PostHog** — Persons API + Events. Activity + funnel signal (alternative to Mixpanel for that crowd)
7. **Firebase Analytics + Crashlytics** — BigQuery export for both. Android-heavy / Firebase-only coverage

Each connector ships with: API client, webhook listener (where applicable), event schema mapper, user matcher, smoke test, README section.

**Phase C — Resend channel + `--send`/`--dry-run` (~2 agent-hrs)**
- Transform `Intervention` → email payload
- `--dry-run` writes interventions to `./interventions/*.json`
- `--send` requires explicit flag + Resend test mode default

**Phase D — Install polish + DM-readiness (~3-5 agent-hrs)**
- `npx rc-retention-brain init` — interactive key paste, writes `.env`
- `--watch` mode tested in real time
- README rewritten install-first; thesis paragraph 2
- End-to-end smoke against your real (or borrowed) sandbox accounts
- Eval suite green on synthetic + spot-check on real
- DM drafted, sleep on it, send

The eval suite + rubric carry through every phase — no phase ships without passing evals.

## Validation path

| Stage | Data source | Goal |
|---|---|---|
| v0 | Synthetic stream | Prove the architecture; pass eval bars |
| v1.0 | Your own / borrowed RC sandbox + Stripe sandbox | Real data, real briefing, install-and-go in <10 min — **DM trigger** |
| v1.1+ | Real production app (yours or a friend's) | Real users, real outcomes |

The contract layer (normalized `Event` and `Intervention` types) is shaped to match real RC webhook + Stripe event payloads from day 1, so the v0 → v1 transition is "swap the source," not a rewrite.

## Roadmap

- **v0** — Synthetic-only, four pillars, CLI demo, evals
- **v1.0 — DM trigger.** All 7 sources (RC, Stripe, Mixpanel, Sentry, Crisp, PostHog, Firebase). Resend channel for action. `--watch` continuous mode. Install in <10 min.
- **v1.1** — Additional channels: OneSignal push, custom webhook for in-app messaging
- **v1.2** — Amplitude connector (Mixpanel alternative for that crowd)
- **v1.3** — Intercom connector (Crisp alternative for larger teams)
- **v1.4** — App reviews source (AppFollow / Appfigures) — review sentiment as churn signal
- **v1.5** — Outcome learning loop (track intervention → outcome → refine rubric over time)
- **v2.0** — Hostable as a service (only if real users emerge)

## Why open source

- **Receipts.** A repo with clean architecture, real tests, real evals = receipts no Loom can match.
- **Compounds.** Stars, PRs, issues = continuous proof of taste over time.
- **Defensible direction.** RC's own roadmap is extending Rico (deeper analysis, more proactive nudges); cross-source per-user real-time operator is genuinely the next ring out, not their immediate next ship.
- **Optionality.** If RC hires you, this becomes part of how you'd build their next layer. If they don't, it's a side project that could become a real product.

## Quality bars (the bar that matters)

- **No marketing language in the README.** Thesis-first, code second, no hype.
- **Every component has a rubric.** "Good intervention" must be defined, not vibes.
- **Evals are CI-enforced.** Quality regressions can't ship.
- **Architecture is extensible by design.** Adding a new signal / channel / source is one folder, no surgery.
- **Demo is reproducible.** One command, deterministic output, lives forever.

## Risks & mitigations

| Risk | Mitigation |
|---|---|
| Synthetic data feels toy-ish | Personas grounded in real subscription patterns; ground truth labels make evals legitimate |
| Risk engine is just heuristics with extra steps | LLM judge does *narrative* reasoning over the timeline — that's the genuine novelty |
| Intervention agent outputs feel generic | Critic sub-agent pass; rubric enforces personalization |
| Project drifts into perpetual side-project | Each weekend has a deliverable; evals provide objective "is this good yet" signal |
| No real RC/Stripe sandbox to test against | Sign up for free RC dev account + Stripe test mode (both free, ~30 min total) |
| Jacob installs and it breaks on his side | Install path tested on a clean machine before DM; smoke test scripted |
| `--send` accidentally fires real emails | Default `--dry-run`; `--send` requires explicit opt-in; Resend test mode is default-default |
| Rico ships exactly this in 6 months | Then you've validated your read on the roadmap; the open-source angle, code quality, and cross-source breadth are still differentiated |

## What we're explicitly NOT doing (to keep scope honest)

- Multi-tenant infra
- Auth, billing, accounts
- A web UI (CLI + structured JSON only)
- Real provider connectors in v0
- Outcome tracking / learning loop in v0
- "Agentic monetization brain" framing in the README — too grandiose, will make people roll eyes. Position as "v0 of a per-user retention operator."

## DM (sent at v1.0 — not before)

The DM is a v1.0 milestone, not a v0 thing. v1.0 means Jacob can install in <10 min and run the brain on his own RC sandbox. Until that's true, no DM.

When v1.0 ships, the DM writes itself in the shape of:

> Beat 1 — thesis (2–3 sentences): Rico is a great analyst. The next layer is an operator — continuous, cross-source, per-user, action-oriented. Here's why that's the next ring out, not what he'll ship next.
>
> Beat 2 — proof (2–3 sentences): Built it: github.com/samy/rc-retention-brain. Reads RC + Stripe, scores per-user churn risk, generates personalized interventions, can dispatch via Resend. Install in <10 min: `npx rc-retention-brain init`. Eval suite included.
>
> Close: One line. "Up for 15 min?" — no marketing, no hype, no asks.

Wording locked at v1.0 ship — wrong time to optimize now.

## Definition of v1 done (the bar)

Don't send the DM until **all** of these are true:

1. Clone → first useful output on a real RC + Stripe sandbox in <10 min
2. README is install-first; thesis fits in paragraph 2
3. `--watch` mode runs continuously without crashing for ≥1 hour
4. Eval suite passes the v0 quality bars on synthetic data + spot-checks reasonably on real data
5. `--send` is gated, default `--dry-run` is honest about being a dry run
6. Repo has CI green, MIT license, contribution doc, working `examples/`
7. You'd actually use it on your own subscription app if you had one

Anything less = not v1 yet = no DM.
