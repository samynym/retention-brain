# rc-retention-brain — Product Spec

## What it is

**An autopilot retention agent for subscription apps.** You point it at your data — RevenueCat, Stripe, your analytics tool, your error tracker, your support inbox — and it tells you, per individual user, who's about to churn, why, and exactly what to send them to save them.

Not "your churn rate is 4.2% this month." That's a dashboard. This is "user_47 just opened your settings page, hit a payment failure 3 days ago, and hasn't logged in for 8 days. Send this email in the next 24 hours, offer a 14-day extension, and here's the actual copy."

It runs continuously in the background once installed.

## The before / after

**Today**, if you run a subscription app:
- You open Mixpanel and see usage is dropping
- You open RC and see who cancelled this week
- You open Intercom and see angry tickets
- You open Sentry and see crashes
- You manually piece this together for *some* users
- You write a winback email by hand for the most painful losses
- 80% of at-risk users get nothing because you don't have time

**With this**, the same data runs through one agent:
- It sees the cross-source pattern per user automatically
- It identifies who's at risk in real time (not after they cancel)
- It writes personalized copy that references their actual behavior
- It either drafts the email for review (`--dry-run`) or sends it (`--send`)
- It does this for every at-risk user, not just the ones you noticed

## The user

Indie devs and small teams running subscription mobile apps on RevenueCat. They:
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

To send all: rc-retention-brain run --send
```

You read the briefings, edit the ones you don't like, run `--send` on the rest. Done.

## What makes it different from existing tooling

Subscription dashboards tell you what already happened. Retention agents decide what to do — per individual user, in real time, before they cancel.

The brain is:
- **Per-user**, not aggregate cohorts
- **Continuous**, not on-demand queries
- **Cross-source** — it joins subscription state, payment health, errors, and usage signal that today live in 4 different tabs
- **Decision-oriented** — generates structured plays (channel, offer, timing, copy), not just metrics

The integrations are pluggable, so it works alongside whatever stack you already have.

## What it explicitly is NOT

- Not a CRM
- Not a marketing automation platform
- Not a paywall designer (RC ships that)
- Not multi-tenant SaaS — runs locally or self-hosted
- Not "an AI to do all your growth" — focused on one job (catching at-risk paying users) and doing it well

## The strategic bet

If "the next layer of subscription tools is autonomous decisioning, not better dashboards" is right, then per-user retention intervention is one of the highest-leverage decisions to automate first. Building it open-source with real evals is a credible argument that you can think and ship at this layer.

- Worst case: you have a useful tool you can run on any subscription app you ever build.
- Best case: it becomes RC's next product (or your own startup).
