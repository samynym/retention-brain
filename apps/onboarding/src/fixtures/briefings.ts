import type { Intervention, RiskScore } from "../types/intervention";

/**
 * Mock briefing fixtures. Each `risk` conforms exactly to RiskScore and each
 * `intervention` to Intervention from packages/core (mirrored in
 * ../types/intervention) — so the UI is wired to the real schema and a future
 * backend can drop real objects into the same renderer.
 *
 * The four users map to the reason-based routing in PRODUCT.md / ARCHITECTURE.md:
 *   1. involuntary billing failure  -> dunning_fix, NO discount
 *   2. trial auto-renew-off, no aha -> re-onboarding email, NO discount
 *   3. engaged-then-lapsed          -> value recap + light offer
 *   4. paid-but-not-using, high risk-> renewal-save before the charge
 *
 * Signal names match the real risk-engine signals (payment_health,
 * usage_decline, engagement_recency, support_sentiment, lifecycle_stage,
 * error_rate) and the per-signal weights echo the tuned values in score.ts.
 */

export type EvidenceEvent = {
  timestamp: string;
  /** an EventKind from core, e.g. "payment.failure" */
  kind: string;
  /** optional human detail, e.g. "$14.99 · Visa ···4421" */
  detail?: string;
};

export type MockBriefing = {
  user_id: string;
  email: string;
  /** short label for the churn archetype, shown as a dossier tag */
  archetype: string;
  risk: RiskScore;
  intervention: Intervention;
  /** raw timeline behind the score — the "receipts" for the why */
  events: EvidenceEvent[];
};

// 1 — Involuntary churn. An active, happy user blocked by a dead card.
//     The play is a payment fix, never a discount.
const involuntaryBilling: MockBriefing = {
  user_id: "user_2207",
  email: "maya.okonkwo@example.com",
  archetype: "Involuntary — failed renewal charge",
  risk: {
    user_id: "user_2207",
    score: 0.88,
    top_signals: [
      {
        name: "payment_health",
        score: 0.96,
        weight: 0.4,
        reason:
          "Card charge of $14.99 failed on May 28; the automatic retry on May 31 also failed. Subscription is now past due.",
      },
      {
        name: "engagement_recency",
        score: 0.18,
        weight: 0.35,
        reason:
          "Still opened the app on Jun 1 — three sessions in the last week. This is a billing failure, not disengagement.",
      },
      {
        name: "usage_decline",
        score: 0.12,
        weight: 0.35,
        reason:
          "Session rate steady at ~4/week through May; no decline in actual usage.",
      },
    ],
    narrative:
      "A healthy, active subscriber locked out by a dead card — textbook involuntary churn. Fix the payment, not the relationship.",
    llm_judge_available: true,
  },
  intervention: {
    user_id: "user_2207",
    risk_score: 0.88,
    channel: "dunning_fix",
    offer: { kind: "none" },
    timing: "immediate",
    copy: {
      subject: "Your May 28 payment didn't go through — quick fix to keep your plan",
      body: `Hi Maya,

Your $14.99 renewal didn't go through on May 28, and the automatic retry on May 31 didn't either — so your plan is paused while you're clearly still using it (we saw you in the app on June 1).

This is almost always an expired or replaced card. You can fix it in under a minute:

  Update your payment method → {billing_url}

Once the charge clears, everything picks up exactly where it left off — no lost history, no change to your plan.

If something else is going on, just reply and we'll sort it out.

— The FitTrack team`,
    },
    reasoning:
      "Involuntary churn from a failed renewal, not a value problem — she's in the app daily. A discount here would be wrong (and train card-failure gaming); the correct play is a frictionless payment-update prompt sent immediately.",
    critique: {
      scores: { relevance: 5, personalization: 5, tone: 4, plausibility: 5 },
      notes:
        "Correctly withholds a discount for an involuntary case. References the specific failed charge and her continued activity.",
      recommendation: "accept",
    },
  },
  events: [
    { timestamp: "2026-01-14T00:00:00.000Z", kind: "subscription.purchase", detail: "Pro · $14.99/mo" },
    { timestamp: "2026-05-22T08:12:00.000Z", kind: "usage.session" },
    { timestamp: "2026-05-25T19:40:00.000Z", kind: "usage.session" },
    { timestamp: "2026-05-28T00:00:00.000Z", kind: "payment.failure", detail: "$14.99 · Visa ···4421 · declined" },
    { timestamp: "2026-05-31T00:00:00.000Z", kind: "payment.retry", detail: "auto-retry · declined" },
    { timestamp: "2026-06-01T07:55:00.000Z", kind: "usage.session", detail: "logged a 5k run" },
  ],
};

// 2 — Trial ending, auto-renew off, never reached the activation moment.
//     A discount can't help someone who hasn't seen value: re-onboard first.
const trialNoAha: MockBriefing = {
  user_id: "user_3391",
  email: "priya.nair@example.com",
  archetype: "Trial ending — never hit the aha moment",
  risk: {
    user_id: "user_3391",
    score: 0.58,
    top_signals: [
      {
        name: "engagement_recency",
        score: 0.72,
        weight: 0.35,
        reason:
          "Last opened May 30. Trial ends Jun 6 with auto-renew turned off, so silence means it lapses by default.",
      },
      {
        name: "usage_decline",
        score: 0.64,
        weight: 0.35,
        reason:
          "Only 2 sessions in a 14-day trial, and never logged a first workout — the activation moment for FitTrack.",
      },
      {
        name: "lifecycle_stage",
        score: 0.5,
        weight: 0.0,
        reason:
          "Day 12 of 14 in trial. Non-scoring on its own, but it sets the deadline for any intervention.",
      },
    ],
    narrative:
      "Trial expires Jun 6 with auto-renew off and she never reached the first logged workout. Re-onboard her to that first win before the window closes.",
    llm_judge_available: true,
  },
  intervention: {
    user_id: "user_3391",
    risk_score: 0.58,
    channel: "email",
    offer: { kind: "none" },
    timing: "before_renewal",
    copy: {
      subject: "Two days left on your trial — here's the 60-second first win",
      body: `Hi Priya,

Your trial ends June 6, and I noticed you set up FitTrack but haven't logged your first workout yet — which is the part that actually makes it click.

It takes about a minute:

  1. Open Today
  2. Tap "Log a workout"
  3. Pick anything you did this week

That's it — from there the weekly trends and streaks fill in on their own.

If you were stuck on something, tell me what and I'll walk you through it. No pressure either way; I'd just hate for you to decide based on a version you never really got to use.

— The FitTrack team`,
    },
    reasoning:
      "She never reached activation, so the driver is onboarding friction, not price. A discount would discount a product she hasn't seen work. The play is a re-onboarding nudge to the specific unused action, timed before the trial lapses.",
    critique: {
      scores: { relevance: 5, personalization: 4, tone: 5, plausibility: 4 },
      notes:
        "Names the exact unused step rather than offering money. Good restraint on discounting a pre-activation user.",
      recommendation: "accept",
    },
  },
  events: [
    { timestamp: "2026-05-24T16:20:00.000Z", kind: "subscription.trial_start", detail: "14-day · auto-renew OFF" },
    { timestamp: "2026-05-24T16:25:00.000Z", kind: "usage.session", detail: "completed signup" },
    { timestamp: "2026-05-24T16:31:00.000Z", kind: "usage.feature", detail: "feature=settings" },
    { timestamp: "2026-05-30T21:03:00.000Z", kind: "usage.session", detail: "opened, no workout logged" },
    { timestamp: "2026-06-06T00:00:00.000Z", kind: "subscription.trial_end", detail: "scheduled · will lapse" },
  ],
};

// 3 — Previously engaged, now cooling. Recap the value built; a light offer
//     lowers the barrier without training discount-seeking.
const engagedThenLapsed: MockBriefing = {
  user_id: "user_0874",
  email: "tomas.herrera@example.com",
  archetype: "Engaged, now cooling off",
  risk: {
    user_id: "user_0874",
    score: 0.64,
    top_signals: [
      {
        name: "usage_decline",
        score: 0.81,
        weight: 0.35,
        reason:
          "Averaged 5 sessions/week through April, then dropped to a single session in the last two weeks.",
      },
      {
        name: "engagement_recency",
        score: 0.58,
        weight: 0.35,
        reason:
          "Last session May 27 — 7 days ago, down from a near-daily habit.",
      },
      {
        name: "support_sentiment",
        score: 0.34,
        weight: 0.05,
        reason:
          "Opened a neutral ticket May 20 asking how to export his training history.",
      },
    ],
    narrative:
      "A power user cooling off — a five-a-week habit slipping to one. Recap the value he's already built before the habit fully breaks.",
    llm_judge_available: true,
  },
  intervention: {
    user_id: "user_0874",
    risk_score: 0.64,
    channel: "email",
    offer: { kind: "discount_percent", value: 15 },
    timing: "within_24h",
    copy: {
      subject: "84 sessions and a 9-week streak — worth not losing",
      body: `Hi Tomás,

You've logged 84 sessions since January and kept a 9-week streak going — one of the most consistent runs we've seen. The last couple of weeks went quiet, which usually just means life got busy.

A couple of things in case they help:
  • Your full training history is one tap away under Profile → Export (you'd asked about this on May 20).
  • Your trends and personal bests are all still there, waiting for the next entry.

If a slightly lighter setup would fit where you're at right now, reply and I'll suggest one. And if it helps to ease back in, here's 15% off your next month — no urgency, it'll be on your account either way.

— The FitTrack team`,
    },
    reasoning:
      "Voluntary slow fade from a genuinely engaged user. Lead with the value he's accumulated (sessions, streak, the export he asked about); a light 15% nudge lowers the re-entry barrier without anchoring him to discounts.",
    critique: {
      scores: { relevance: 4, personalization: 5, tone: 4, plausibility: 4 },
      notes:
        "Ties back to a real support question and concrete stats. Offer is appropriately light for a still-warm user.",
      recommendation: "accept",
    },
  },
  events: [
    { timestamp: "2026-01-09T00:00:00.000Z", kind: "subscription.purchase", detail: "Pro · $14.99/mo" },
    { timestamp: "2026-04-08T06:40:00.000Z", kind: "usage.session" },
    { timestamp: "2026-04-21T07:12:00.000Z", kind: "usage.session", detail: "feature=trends" },
    { timestamp: "2026-05-20T11:02:00.000Z", kind: "support.ticket_open", detail: "sentiment=neutral · export history" },
    { timestamp: "2026-05-27T20:18:00.000Z", kind: "usage.session", detail: "last session" },
  ],
};

// 4 — Paid up front, used it hard, then vanished — and it silently renews.
//     High-value renewal-save before the charge lands.
const paidNotUsing: MockBriefing = {
  user_id: "user_1502",
  email: "rebecca.lindqvist@example.com",
  archetype: "Paid annual, gone quiet before renewal",
  risk: {
    user_id: "user_1502",
    score: 0.79,
    top_signals: [
      {
        name: "usage_decline",
        score: 0.92,
        weight: 0.35,
        reason:
          "12 sessions in the three weeks after purchase, then 0 in the last 21 days.",
      },
      {
        name: "engagement_recency",
        score: 0.9,
        weight: 0.35,
        reason: "Last session May 12 — 22 days ago.",
      },
      {
        name: "payment_health",
        score: 0.08,
        weight: 0.4,
        reason:
          "Annual plan in good standing; renews Jun 9 for $149.00 — the charge will land into total silence.",
      },
    ],
    narrative:
      "Paid $149 up front, used it hard for three weeks, then went dark — and the plan silently renews Jun 9. Save the renewal before the charge, or it churns (and disputes) at the bill.",
    llm_judge_available: true,
  },
  intervention: {
    user_id: "user_1502",
    risk_score: 0.79,
    channel: "email",
    offer: { kind: "discount_percent", value: 25 },
    timing: "before_renewal",
    copy: {
      subject: "Before your plan renews June 9 — let's get you back to week three",
      body: `Hi Rebecca,

Heads up that your annual plan renews on June 9 for $149.

You started strong — 12 sessions in your first three weeks — and then things went quiet about three weeks ago. I don't want the renewal to just land out of nowhere, so two options, whichever's fair:

  • If you want back in: reply and I'll rebuild the week-three setup that was working for you, plus take 25% off this renewal to make up for the quiet stretch.
  • If now isn't the time: I can pause the renewal so you're not charged for a year you're not using.

Either way you're in control — just let me know which.

— The FitTrack team`,
    },
    reasoning:
      "High-value annual renewal at risk from pure inactivity. Reaching out before the charge converts a likely silent-churn-plus-dispute into a save; the 25% goodwill credit offsets the unused stretch, and offering a pause builds the trust this product depends on.",
    critique: {
      scores: { relevance: 5, personalization: 4, tone: 4, plausibility: 5 },
      notes:
        "Surfaces the upcoming charge honestly and offers a pause, not just a discount. Strong trust posture for a billing-sensitive moment.",
      recommendation: "accept",
    },
  },
  events: [
    { timestamp: "2026-05-01T00:00:00.000Z", kind: "subscription.purchase", detail: "Annual · $149.00" },
    { timestamp: "2026-05-03T18:22:00.000Z", kind: "usage.session" },
    { timestamp: "2026-05-09T07:30:00.000Z", kind: "usage.session", detail: "feature=plan_builder" },
    { timestamp: "2026-05-12T06:48:00.000Z", kind: "usage.session", detail: "last session" },
    { timestamp: "2026-06-09T00:00:00.000Z", kind: "subscription.renewal", detail: "scheduled · $149.00" },
  ],
};

/** The "wow" dataset — ordered high-risk first, the way the briefing reads. */
export const SAMPLE_BRIEFINGS: MockBriefing[] = [
  involuntaryBilling,
  paidNotUsing,
  engagedThenLapsed,
  trialNoAha,
];

/** Mock account context shown in the briefing masthead. */
export const ACCOUNT = {
  app: "FitTrack",
  subscribers: 812,
  briefingDate: "2026-06-03T00:00:00.000Z",
  /** what "Analyze" nominally scanned, for the analyzing screen + summary */
  scanned: 812,
};
