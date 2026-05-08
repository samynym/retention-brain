# rc-retention-brain — Spec

**Status:** Spec v3 · 2026-05-08 (post-debate revision)
**Pace:** Side project, ~5–6 weekends, no fixed deadline
**Format:** Public open-source GitHub repo (MIT). No web demo, no Loom — the repo + a real briefing are the artifact.
**Positioning:** A continuous, cross-source, per-user retention agent for subscription apps. Built for personal validation; **DM Jacob at v1.0** — when he can install it and run it on a real RC + Stripe sandbox in under 10 minutes and see a useful briefing.

---

## Thesis

> *Subscription dashboards tell you what happened. Retention agents decide what to do — per individual user, in real time, before they cancel.*

Even the best subscription tooling stops at metrics + cohort nudges. The next layer is an **operator**: a continuous, cross-source, per-user agent that watches your subscription business and decides — for each at-risk user, individually — channel, offer, timing, and copy. Approval gates while it learns trust; autonomous within guardrails when earned.

`rc-retention-brain` is that operator. v0 proves the architecture on synthetic data; v1 makes it real and installable on a real subscription stack (RC + Stripe + Sentry + PostHog).

## v1 = the DM bar

The DM is sent when v1 ships. v1 means Jacob can:

```
$ npx rc-retention-brain init
> Paste your RC API key (optional if Stripe is set):
> Paste your Stripe API key (optional if RC is set):
> Paste your Sentry auth token (optional, recommended):
> Paste your PostHog personal API key (optional, recommended):
> Paste your Resend API key (optional, only for v1.1 --send):

$ npx rc-retention-brain seed-sandbox        # populates RC + Stripe sandboxes with realistic users
$ npx rc-retention-brain run
🧠 Reading subscription state: 1,247 subscribers from RC + Stripe
🐞 Reading Sentry: 312 users with errors in last 14 days
📊 Reading PostHog: 1,247 users matched, usage decline computed
🧮 Risk engine: 73 users flagged at risk
🤖 Intervention agent: generating briefings for top 20…

→ Briefing written to ./briefing-2026-05-08.md
→ 20 intervention drafts in ./interventions/
→ (v1 ships briefing-only. --send is v1.x.)
```

Clone, paste keys (you only need ≥1 of {RC, Stripe} to start), seed if needed, run, get a real retention briefing in <10 minutes. Sub-bar = DM is premature.

**v1 must deliver on four points of differentiation from existing subscription tooling:**

| Differentiator | v1 implementation |
|---|---|
| Per-user (vs aggregate) | Risk + intervention generated per subscriber |
| Continuous (vs on-demand) | `--watch` mode that polls events on schedule |
| Cross-source (vs single-tool) | **4 sources:** RC, Stripe, Sentry, PostHog (≥1 of {RC, Stripe} required; Sentry + PostHog optional) |
| Decision-oriented (vs metrics-only) | Generates structured `Intervention` per user — channel, offer, timing, copy, reasoning |

**Why 4 sources, not 7 or 1:** Each source provides an orthogonal signal dimension that no single tool sees together — RC/Stripe for subscription state, Sentry for errors-as-churn-signal (the novel angle), PostHog for usage decline. More than 4 is feature-list cosplay before any one of them is proven; fewer leaves obvious churn signals on the table. Source 5+ slot into the same `Source` interface in v1.x as the architecture earns trust.

**Briefing-first, sending-later.** v1 ships the briefing path only — the agent generates structured `Intervention` objects, writes them to disk, prints the briefing. **No `--send` in v1.** Real email dispatch is v1.x once briefing trust is earned. This collapses the trust ask: installing v1 cannot, by design, send anything to your customers.

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

Time in **agent-hours**, not weekends. Plausibly 2-3 focused weekends wall-clock, including key provisioning and seed-sandbox setup.

**Phase 5.5 — Eval methodology fixes (~3-4 agent-hrs)**

The post-v0 debate flagged the eval as the weakest link. Fix before adding real connectors so v1 has trustworthy numbers:
- **Train/eval seed split** — different seeds for tuning weights vs. reporting numbers
- **Pre-registered thresholds** — drop the median-of-churners threshold pick; assert at fixed thresholds (0.4, 0.5, 0.6) and report all of them
- **Adversarial personas** added to simulator (re-engagers who look lapsing then return; happy users who happen to crash a lot) so signals can't trivially match generator parameters
- **Critic uses a different model than composer** in eval mode, OR ensemble of two models — to break the Sonnet-judges-Sonnet closed loop
- **Surface critic verdict on `Intervention`** — not just `console.warn`, so eval can correlate critic accept-rate with downstream signals
- **LLM judge availability tracked** as an explicit field on `RiskScore`, not silently substituted to 0 on error

**Phase 6 — Connector foundation + 4 real source connectors (~10-14 agent-hrs)**

Generic `Source` interface (already exists). User matching strategy module (email-primary with `app_user_id` metadata fallback). Then 4 connectors:

1. **RevenueCat** — REST API + webhook listener. Subscribers, transactions, entitlements
2. **Stripe** — REST + webhook. Customers, subscriptions, invoices, charge.failed, payment_method events
3. **Sentry** — Issues API + user-tied events. *Novel angle: errors as per-user churn predictor*
4. **PostHog** — Persons API + Events. Activity decline + engagement recency

Constraint: ≥1 of {RC, Stripe} must be configured at runtime. Sentry + PostHog are pure-optional. CLI prints clear errors if no subscription source is wired.

Each connector ships with: API client, webhook listener (where applicable), event schema mapper, user matcher, smoke test, README section.

**Phase 7 — Briefing renderer + seed-sandbox (~3-4 agent-hrs)**

- `npx rc-retention-brain run` writes `briefing-<date>.md` (markdown briefing the user reads)
- `npx rc-retention-brain seed-sandbox` populates an RC sandbox + Stripe test mode + (optional) Sentry + PostHog with ~50 realistic users so install can be validated end-to-end without a real app
- `--watch` mode for continuous polling of webhook-friendly sources

**No `--send` channel in v1.** Resend connector is deferred to v1.x. Briefing-first is the trust ask v1 makes.

**Phase 8 — Install polish + DM-readiness (~3-5 agent-hrs)**
- `npx rc-retention-brain init` — interactive key paste, writes `.env`
- README rewritten — install-first paragraph, real briefing screenshot embedded, thesis paragraph 2
- Screen recording from `git clone` to first real briefing on a clean machine + fresh sandbox — under 10 minutes, otherwise fix install before DM
- Eval suite green on synthetic + spot-check on the seeded sandbox
- DM drafted, sleep on it, send

The eval suite + rubric carry through every phase — no phase ships without passing evals.

## Validation path

| Stage | Data source | Goal |
|---|---|---|
| v0 ✅ | Synthetic stream | Prove the architecture; pass eval bars |
| v0.5 (Phase 5.5) | Synthetic + adversarial personas, seed-split | Trustworthy eval methodology before real data |
| v1.0 | RC sandbox + Stripe test + Sentry + PostHog, seeded with ~50 realistic users | Real-API briefing, install-and-go in <10 min — **DM trigger** |
| v1.1+ | Real production app (yours or a friend's via outreach) | Real users, real outcomes |

**Path A (locked):** Sandbox-only validation for v1. The seed-sandbox script populates real RC/Stripe/Sentry/PostHog sandboxes with realistic events; the brain runs against real APIs. This proves install + connectors + briefing format on real systems. It does not prove real-world signal quality — that's v1.1+ when real-app data appears.

The contract layer (normalized `Event` and `Intervention` types) matches real RC webhook + Stripe event payloads, so the v0 → v1 transition is "swap source," not a rewrite.

## Roadmap

- **v0** ✅ — Synthetic-only, four pillars, CLI demo, evals
- **v0.5** — Eval methodology fixes (seed split, adversarial personas, pre-registered thresholds, non-self-judging critic)
- **v1.0 — DM trigger.** 4 sources (RC, Stripe, Sentry, PostHog), ≥1 of {RC, Stripe} required. Briefing-only (no send). `--watch` mode. seed-sandbox script. Install in <10 min on sandboxes.
- **v1.1** — Resend channel + `--send` (briefing-trust-earned upgrade)
- **v1.2** — Mixpanel / Amplitude connector (PostHog alternative)
- **v1.3** — Crisp / Intercom connector (support sentiment)
- **v1.4** — Firebase Analytics + Crashlytics (Android/Firebase-only coverage)
- **v1.5** — App reviews source (AppFollow / Appfigures) + OneSignal push channel
- **v1.6** — Outcome learning loop (track intervention → outcome → refine rubric)
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
