# onboarding (mockup)

A clickable front-end **mockup** of the hosted onboarding flow for the
retention agent. Its only job is to validate the UX and the first-run "wow"
before the backend exists.

**Mock only.** No backend, no real OAuth, no MCP calls, no persistence. State
lives entirely in memory (`useReducer`).

## Run

```bash
pnpm --filter @retention-brain/onboarding dev   # http://localhost:5180
```

## Flow

One in-memory state machine (`src/state/machine.ts`) drives these screens:

0. **Sign in** — mock OAuth gate (Google / GitHub), framed invite-only +
   allowlist. OAuth *is* the auth; there's no separate register/password. The
   beta runs on **our** model key, so this allowlist is the real-world guard
   against anonymous traffic running up the bill. (BYO-key was explored and
   removed for now — frictionless first.)
1. **Connect** — at least one billing source ( **one or several** : RevenueCat /
   Stripe / any MCP — shown with a live "Connect at least 1" tracker; you can
   connect both RC and Stripe) plus optional signals. Multi-provider slots
   (analytics → PostHog / Mixpanel / Amplitude; support → Gmail / Crisp /
   Help Scout / Plain / Intercom) ask *which* tool you use, then connect that
   tool's MCP server — the others stay untouched. Support is email-first because
   most indie devs do support over Gmail, not a ticketing tool. `Analyze`
   unlocks once ≥1 billing source is connected. Every connect is a ~1s mock.
2. **Analyzing** — a ~1.5s loader.
3. **Briefing** — the hero. Per-user "user-plays": who, why (signals referencing
   the user's actual mock events), recommended play (channel · offer · timing),
   and the drafted subject + body. The nudge banner above is category-aware. The
   email can be **edited inline** and **sent via a mock Gmail MCP** connection
   (connect once, send from any card). Approve / Skip triage is visual only.
4. **Zero-signal** — the honest empty state, reachable via the dev toggle
   (bottom-right). The dev toggle also resets the flow.
5. **Operator view** — what the person who *shipped* the tool sees across their
   invited devs: weekly **model spend** (you're on our key during the beta, so
   this is your bill), an activation funnel (signed in → connected → analysis
   run → email sent), and per-dev activity including **est. cost** — the signal
   for when BYO-key is worth turning on. No briefing content, no customer
   billing data; the only content path is a dev explicitly sharing a briefing.
   Reachable via the "Operator" dev toggle (bottom-right).

## Wired to the real schema

`src/types/intervention.ts` mirrors `@retention-brain/core`'s `Intervention`,
`RiskScore`, and `Signal` verbatim. The fixtures in `src/fixtures/briefings.ts`
conform to those types, so a real backend can drop real objects into the same
renderer. The four users map to the reason-based routing in `PRODUCT.md`:

| User | Archetype | Play |
|---|---|---|
| `user_2207` | Involuntary billing failure | `dunning_fix`, **no** discount |
| `user_1502` | Paid annual, gone quiet before renewal | renewal-save before the charge |
| `user_0874` | Engaged, now cooling off | value recap + light offer |
| `user_3391` | Trial ending, never hit aha | re-onboarding, **no** discount |

## Design

Editorial "morning intelligence briefing" on warm paper. Newsreader (display) /
Hanken Grotesk (body) / JetBrains Mono (data), one ember accent, risk on a calm
earthen scale (not the red/green of a generic dashboard — this product handles
billing data and should read as trusted). `color-scheme: light only` so dark-mode
browsers don't auto-invert it.
