# retention-brain — Product Spec

## What it is

**An autopilot retention agent for subscription apps.** You point it at your data — your billing platform, your analytics tool, your error tracker, your support inbox (Stripe, RevenueCat, PostHog, Sentry, Intercom, anything with an MCP server) — and it tells you, per individual user, who's about to churn, why, and exactly what to send them to save them.

Not "your churn rate is 4.2% this month." That's a dashboard. This is "user_47 just opened your settings page, hit a payment failure 3 days ago, and hasn't logged in for 8 days. Send this email in the next 24 hours, offer a 14-day extension, and here's the actual copy."

You run it on a schedule — cron, CI, or the hosted runner. Each run produces a fresh briefing.

## The before / after

**Today**, if you run a subscription app:
- You open Mixpanel and see usage is dropping
- You open your billing dashboard and see who cancelled this week
- You open Intercom and see angry tickets
- You open Sentry and see crashes
- You manually piece this together for *some* users
- You write a winback email by hand for the most painful losses
- 80% of at-risk users get nothing because you don't have time

**With this**, the same data runs through one agent:
- It sees the cross-source pattern per user automatically
- It identifies who's at risk in real time (not after they cancel)
- It writes personalized copy that references their actual behavior
- It drafts the email for review — sending stays behind the trust ladder (approve-each lands in v1.1)
- It does this for every at-risk user, not just the ones you noticed

## The user

Indie devs and small teams running subscription apps (mobile or web). They:
- Have ~hundreds to ~tens-of-thousands of paying users
- Already pay attention to churn but can only handle the loudest cases manually
- Don't have a dedicated retention/lifecycle team
- Are technically comfortable (will install a CLI, paste API keys)

Not enterprise — they have Iterable + Braze + Customer.io + a retention squad. Not zero-tech founders — they need a UI for everything. The wedge is the in-between.

## Concrete example

You install it Saturday. By Monday morning, sitting in your terminal:

```
Briefing for app "FitTrack" — May 11, 2026

23 users at high churn risk (>0.7)
14 at medium risk (0.5-0.7)

TOP 5 — recommended interventions ready to send:

1. user_alice@example.com (risk 0.91)
   Why: cancelled trial 2d ago after 3 paywall views;
        Sentry shows she hit the "export PDF" crash twice
   Send: email · 50% off first month · within 24h
   Subject: "Sorry the export crashed — here's a way to make it right"
   [draft saved to ./interventions/alice-…json]

2. user_bob@example.com (risk 0.84)
   Why: payment failed Sunday, no retry; 4 days no sessions
   Send: email · 7-day grace + payment update link · immediate
   ...

Drafts saved to ./interventions/ — review and send from your own client.
```

You read the briefings, edit the ones you don't like, and send them from your own client. Done. (`--send` with approve-each is the v1.1 rung of the trust ladder.)

## What makes it different from existing tooling

Subscription dashboards tell you what already happened. Retention agents decide what to do — per individual user, in real time, before they cancel.

The brain is:
- **Per-user**, not aggregate cohorts
- **Continuous**, not on-demand queries
- **Cross-source** — it joins subscription state, payment health, errors, and usage signal that today live in 4 different tabs
- **Decision-oriented** — generates structured plays (channel, offer, timing, copy), not just metrics

The integrations are pluggable, so it works alongside whatever stack you already have.

## Two flavors of intervention

Not every churn signal needs an email. When the user's top driver is a crash, the action that *actually* moves retention is fixing the bug — and the next user who hits the same crash won't churn either. So the agent produces two kinds of output from the same signal foundation:

- **user-play** — drafted retention copy aimed at the at-risk user (channel, offer, timing, subject + body).
- **engineering-play** — a stabilization ticket aimed at the dev, written as a Markdown file in `engineering-tickets/` with title, severity, crash evidence, proposed investigation, and likely fix direction. No Linear/Jira required; the Markdown files can be fed into whatever workflow already exists.

Crash-driven users get the engineering-play. Retention-risk users get the user-play. Some users get both.

## What it explicitly is NOT

- Not a CRM
- Not a marketing automation platform
- Not a paywall designer (your billing platform ships that)
- Not multi-tenant SaaS — runs locally or self-hosted
- Not "an AI to do all your growth" — focused on one job (catching at-risk paying users) and doing it well
