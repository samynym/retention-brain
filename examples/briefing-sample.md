# Retention Briefing — 2026-05-08

**Account summary:** 80 subscribers · 17 flagged at risk (≥0.40) · top driver: usage_decline (8)

**Engineering plays drafted:** 3 stabilization ticket(s) in `./engineering-tickets/` (crash-driven users; see "Engineering plays" section below).

_Sources: synthetic · cutoff: 2026-05-08T00:00:00.000Z_

## At-risk users (not yet canceled) — top 4 of 4

### 1. user51@example.test — risk 0.95

**Why flagged**
- payment_health: Recent payment failure with no subsequent success.
- engagement_recency: Last session 15.4 days ago.
- usage_decline: Early-window 2 sessions → recent 0/7d (decline at low absolute rate).

> The user experienced multiple crashes without recent sessions (since 2026-04-22), and a payment failure occurred on 2026-05-07, indicating potential disengagement and financial issues.

**Recommended play**
- Channel: dunning_fix
- Offer: extension_days=14
- Timing: immediate
- Critic verdict: accept (4.3/5)

**Subject:** Payment on May 7 didn’t go through — quick fix + 14‑day extension
**Body:**

```
Hi user_51,

We noticed your last session was on April 22 and you hit a few crashes then—sorry for the interruption. On May 7, your payment didn’t go through, so billing is currently paused.

Here’s how to restore access:
- Update your payment method on your account’s Billing page (or use this link: {billing_url}).
- Select Retry payment once your details are up to date.

To make up for the downtime, we’ll add a 14‑day extension to your current term as soon as the payment succeeds—so you don’t lose any time.

If those crashes were part of why you stepped away, we’d really like to help. Reply here with what you were doing when it happened (or reach us at {support_contact}) and we’ll take a look.

Thanks,
The Team
```

**Engineering play**
- [`engineering-tickets/2026-05-08-user_51-user-51-experiencing-frequent-crashes-le.md`](./engineering-tickets/2026-05-08-user_51-user-51-experiencing-frequent-crashes-le.md) (high)

<details><summary>Evidence</summary>

- 2026-02-27 00:00 · subscription.purchase · currency=USD
- 2026-04-08 00:00 · error.crash
- 2026-04-08 08:49 · usage.session
- 2026-04-09 00:00 · error.crash
- 2026-04-12 22:16 · usage.session
- 2026-04-21 00:00 · error.crash
- 2026-04-22 13:41 · usage.session
- 2026-04-22 13:41 · usage.feature · feature=share
- 2026-04-22 13:41 · usage.feature · feature=premium_feature_b
- 2026-04-24 00:00 · error.crash
- 2026-05-04 00:00 · error.crash
- 2026-05-07 00:00 · payment.failure · amount=9.99 currency=USD

</details>

### 2. user46@example.test — risk 0.68

**Why flagged**
- usage_decline: Last-7-day session rate 0.00/day vs baseline 0.09/day (drop 100%).
- engagement_recency: Last session 15.4 days ago.
- error_rate: 2 crashes in the last 14 days.

> User experienced multiple crashes without any recent sessions; last session was more than 14 days ago.

**Recommended play**
- Channel: email
- Offer: no offer
- Timing: immediate
- Critic verdict: accept (4.1/5)

**Subject:** Here to help after two recent crashes
**Body:**

```
Hi user_46,

We haven’t seen a session from you in about two weeks, and we recorded two crashes in the last 14 days. That’s frustrating—sorry you ran into that.

If you’re open to it, a quick reply with the details below will help us track it down:
- what you were doing right before it crashed
- your device and OS version
- roughly when it happened (time and timezone)

A couple of quick things that often resolve crash loops: updating to the latest app version and restarting your device.

If you’re taking a break, no worries. If the crashes blocked you, we’re here to help you get back to a smooth experience. Just reply to this email and we’ll jump in.

—Support Team
```

**Engineering play**
- [`engineering-tickets/2026-05-08-user_46-crash-issue-user-46-experiences-multiple.md`](./engineering-tickets/2026-05-08-user_46-crash-issue-user-46-experiences-multiple.md) (high)

<details><summary>Evidence</summary>

- 2026-03-17 00:00 · subscription.purchase · currency=USD
- 2026-04-08 00:00 · error.crash
- 2026-04-11 00:00 · error.crash
- 2026-04-18 12:33 · usage.session
- 2026-04-18 12:33 · usage.feature · feature=dashboard
- 2026-04-18 12:33 · usage.feature · feature=search
- 2026-04-22 13:29 · usage.session
- 2026-04-22 13:29 · usage.feature · feature=share
- 2026-04-22 13:29 · usage.feature · feature=premium_feature_a
- 2026-04-26 00:00 · error.crash
- 2026-04-30 00:00 · error.crash
- 2026-05-07 00:00 · payment.success · amount=9.99 currency=USD

</details>

### 3. user69@example.test — risk 0.63

**Why flagged**
- engagement_recency: Last session 21.8 days ago.
- usage_decline: Early-window 1 sessions → recent 0/7d (decline at low absolute rate).

> User 69 experienced a crash on 2026-04-09 and has not had a session since 2026-04-16, which is over 14 days ago, despite a successful renewal on 2026-05-07, indicating high churn risk due to disengagement.

**Recommended play**
- Channel: email
- Offer: feature_unlock=0
- Timing: immediate
- Critic verdict: revise (3.5/5)

**Subject:** We fixed the April 9 crash and unlocked a few extras for you
**Body:**

```
Hi there,

I saw you hit a crash on April 9—sorry for the interruption. We’ve shipped the fix and stability looks good now.

It’s been a few weeks since we last saw you (your last session was in mid‑April). Thanks for keeping your subscription active on May 7—your account’s in good standing.

To make the return a little easier, we’ve unlocked a couple of advanced features in your account so you can explore what’s new without changing your plan. When you’re ready, just open the app and pick up where you left off.

If anything still feels off, reply here and we’ll take a closer look.

—The Team
```

<details><summary>Evidence</summary>

- 2026-02-09 00:00 · subscription.purchase · currency=USD
- 2026-04-09 00:00 · error.crash
- 2026-04-16 05:00 · usage.session
- 2026-04-16 05:00 · usage.feature · feature=search
- 2026-05-07 00:00 · payment.success · amount=9.99 currency=USD

</details>

### 4. user63@example.test — risk 0.59

**Why flagged**
- usage_decline: Last-7-day session rate 0.00/day vs baseline 0.09/day (drop 100%).
- engagement_recency: Last session 8.7 days ago.
- error_rate: 1 crash in the last 14 days.

> User experienced multiple crashes followed by a lack of engagement, and has not logged in for 14+ days since the last session on April 29, indicating a high risk despite recent successful payment.

**Recommended play**
- Agent recommended no action — signal too borderline to warrant a retention email yet. Re-evaluate at next run.

<details><summary>Evidence</summary>

- 2026-02-26 00:00 · subscription.purchase · currency=USD
- 2026-04-10 00:00 · error.crash
- 2026-04-17 00:00 · error.crash
- 2026-04-18 00:00 · error.crash
- 2026-04-19 00:21 · usage.session
- 2026-04-19 00:21 · usage.feature · feature=premium_feature_b
- 2026-04-19 00:21 · usage.feature · feature=search
- 2026-04-23 00:00 · support.ticket_open · sentiment=negative
- 2026-04-26 00:00 · error.crash
- 2026-04-29 06:12 · usage.session
- 2026-04-29 06:12 · usage.feature · feature=settings
- 2026-04-29 06:12 · usage.feature · feature=share

</details>

## Recent cancels — win-back candidates — top 5 of 13

### 1. user9@example.test — risk 0.69

**Why flagged**
- usage_decline: Last-7-day session rate 0.00/day vs baseline 0.09/day (drop 100%).
- engagement_recency: Last session 16.2 days ago.

> The user has canceled their subscription due to declining usage, and the last session was 16 days ago, indicating disengagement.

**Recommended play**
- Channel: email
- Offer: discount_percent=20
- Timing: immediate
- Critic verdict: revise (3.8/5)

**Subject:** Checking in after your cancellation
**Body:**

```
Hi there,

I noticed you canceled after using us less—your last session was 16 days ago, and you didn’t log in at all last week. Totally understandable when a tool falls out of the rotation.

For what it’s worth, there weren’t any payment hiccups on your account; this seems more like a fit or timing thing. If there’s one change that would have kept you around, what was it? Even a short reply helps us prioritize.

If you’d like to give it another try, we’ll take 20% off your first month back. Just reply to this email and we’ll send a reactivation link with the discount—no pressure either way.

Thanks for giving us a shot,
The team
```

<details><summary>Evidence</summary>

- 2026-02-13 00:00 · subscription.purchase · currency=USD
- 2026-04-08 19:16 · usage.session
- 2026-04-08 19:16 · usage.feature · feature=search
- 2026-04-08 19:16 · usage.feature · feature=premium_feature_a
- 2026-04-18 00:00 · error.crash
- 2026-04-18 00:00 · support.ticket_open · sentiment=neutral
- 2026-04-21 18:48 · usage.session
- 2026-04-21 18:48 · usage.feature · feature=dashboard
- 2026-04-21 18:48 · usage.feature · feature=dashboard
- 2026-04-27 00:00 · subscription.cancel · reason=usage_decline

</details>

### 2. user28@example.test — risk 0.66

**Why flagged**
- engagement_recency: Last session 17.5 days ago.
- usage_decline: Early-window 4 sessions → recent 0/7d (decline at low absolute rate).
- error_rate: 3 crashes in the last 14 days.

> User had multiple crashes followed by session inactivity and a recent subscription cancellation citing usage decline.

**Recommended play**
- Channel: email
- Offer: feature_unlock=30
- Timing: immediate
- Critic verdict: accept (4.0/5)

**Subject:** About the crashes you hit—and 30 days of Pro on us
**Body:**

```
Hi user_28,

I noticed your last session was about 17 days ago, right after three crashes in the past two weeks. Your early usage (four sessions) then dropped to none last week, and you recently canceled, citing lower usage. That’s on us—sorry for the rough patch.

We’ve shipped stability improvements and are watching crash reports closely. To make it easier to give it another try, I’ve unlocked Pro features on your account free for the next 30 days. Just sign in and you’ll see Pro active.

If anything still crashes, a quick note about what you were doing will help us fix it fast. If there’s anything you want us to restore or set up to save you time, I’m here.

Thanks for giving us another shot,
Alex
Support Team
```

**Engineering play**
- [`engineering-tickets/2026-05-08-user_28-investigate-user-28-crash-pattern-leadin.md`](./engineering-tickets/2026-05-08-user_28-investigate-user-28-crash-pattern-leadin.md) (high)

<details><summary>Evidence</summary>

- 2026-04-03 00:00 · subscription.purchase · currency=USD
- 2026-04-11 00:00 · error.crash
- 2026-04-12 00:00 · error.crash
- 2026-04-13 00:00 · error.crash
- 2026-04-16 11:43 · usage.session
- 2026-04-19 12:09 · usage.session
- 2026-04-20 11:28 · usage.session
- 2026-04-21 00:00 · error.crash
- 2026-04-27 00:00 · error.crash
- 2026-04-30 00:00 · error.crash
- 2026-05-01 00:00 · error.crash
- 2026-05-04 00:00 · subscription.cancel · reason=usage_decline

</details>

### 3. user68@example.test — risk 0.66

**Why flagged**
- engagement_recency: Last session 24.9 days ago.
- usage_decline: Early-window 1 sessions → recent 0/7d (decline at low absolute rate).

> The user experienced multiple crashes in April and has since canceled their subscription, indicating a high likelihood of churn.

**Recommended play**
- Channel: email
- Offer: feature_unlock=0
- Timing: immediate
- Critic verdict: accept (4.3/5)

**Subject:** We fixed April’s crashes—let me unlock a premium feature for you
**Body:**

```
Hi user_68,

I’m sorry about the crashes you hit in April. I can see your last session was about 25 days ago, and there haven’t been any sessions in the last week. You also canceled shortly after the crashes—totally understandable.

We’ve traced those April crash paths and shipped stability fixes. If you’re open to giving us another try, I’d like to make it easier: I can unlock one premium feature of your choice at no charge so you can explore the latest build without resubscribing.

Just reply with the feature you want and I’ll switch it on right away. And if anything still breaks, a quick note about what screen you were on will help us dig in fast.

No pressure—your billing stays off until you choose to restart.

Thanks for considering,
The Support Team
```

<details><summary>Evidence</summary>

- 2026-03-08 00:00 · subscription.purchase · currency=USD
- 2026-04-11 00:00 · error.crash
- 2026-04-13 03:09 · usage.session
- 2026-04-13 03:09 · usage.feature · feature=share
- 2026-04-13 03:09 · usage.feature · feature=share
- 2026-04-15 00:00 · error.crash
- 2026-04-30 00:00 · subscription.cancel · reason=usage_decline

</details>

### 4. user45@example.test — risk 0.63

**Why flagged**
- engagement_recency: Last session 16.6 days ago.
- usage_decline: Early-window 6 sessions → recent 0/7d (decline at low absolute rate).

> The user canceled their subscription citing usage decline and has not logged in since 2026-04-21, indicating a likely churn.

**Recommended play**
- Channel: email
- Offer: discount_percent=15
- Timing: immediate
- Critic verdict: revise (3.8/5)

**Subject:** Haven't seen you since April 21—try us again with 15% off
**Body:**

```
Hi user_45,

You canceled recently and mentioned your usage had dipped. We also haven’t seen a login since April 21, and there weren’t any billing issues—it just looked quieter.

If you’d like to give it another try, here’s 15% off your first month back: Reactivate with 15% off

If the timing still isn’t right, no worries. If there’s one thing that would make it useful again, just reply and let us know.

Thanks for giving us a try,
The team
```

<details><summary>Evidence</summary>

- 2026-03-28 00:00 · subscription.purchase · currency=USD
- 2026-04-09 05:17 · usage.session
- 2026-04-12 06:21 · usage.session
- 2026-04-13 06:18 · usage.session
- 2026-04-15 06:21 · usage.session
- 2026-04-16 15:34 · usage.session
- 2026-04-19 13:11 · usage.session
- 2026-04-20 23:37 · usage.session
- 2026-04-21 10:35 · usage.session
- 2026-04-21 10:35 · usage.feature · feature=export
- 2026-04-21 10:35 · usage.feature · feature=premium_feature_b
- 2026-04-28 00:00 · subscription.cancel · reason=usage_decline

</details>

### 5. user31@example.test — risk 0.62

**Why flagged**
- usage_decline: Baseline 9 sessions/23d → recent 0/7d (sharp drop).
- engagement_recency: Last session 9.5 days ago.

> The user cancelled their subscription recently citing usage decline, indicating a high risk of churn.

**Recommended play**
- Channel: email
- Offer: discount_percent=20
- Timing: immediate
- Critic verdict: revise (3.8/5)

**Subject:** A simpler way back, with 20% off
**Body:**

```
Hi user_31,

You mentioned canceling because usage dropped. Looking at your history, you were averaging about 9 sessions over 23 days, then 0 in the last 7 days—your last visit was about 10 days ago. If your workflow shifted, that makes sense, and it looks like billing wasn’t the issue.

If you’d like to give us another try, we’ve added 20% off your first month back. It’s available for the next 7 days. You can reactivate from your account and the discount will apply at checkout.

If you reply with what changed (even a sentence), I’m happy to suggest a lighter setup or point you to features that match your current pace.

Either way, thanks for giving us a shot.

—The team
```

<details><summary>Evidence</summary>

- 2026-02-11 00:00 · subscription.purchase · currency=USD
- 2026-04-14 15:53 · usage.session
- 2026-04-19 07:03 · usage.session
- 2026-04-20 06:27 · usage.session
- 2026-04-21 12:11 · usage.session
- 2026-04-22 22:48 · usage.session
- 2026-04-23 06:51 · usage.session
- 2026-04-24 07:21 · usage.session
- 2026-04-27 18:48 · usage.session
- 2026-04-28 11:23 · usage.session
- 2026-04-28 11:23 · usage.feature · feature=search
- 2026-04-30 00:00 · subscription.cancel · reason=usage_decline

</details>

### Remaining in this section (8)

- `user_78` — risk 0.69 · top: payment_health · agent: no_op (risk borderline)
- `user_60` — risk 0.65 · top: engagement_recency · agent: no_op (risk borderline)
- `user_59` — risk 0.62 · top: usage_decline · agent: no_op (risk borderline)
- `user_16` — risk 0.61 · top: usage_decline · agent: no_op (risk borderline)
- `user_13` — risk 0.58 · top: payment_health · agent: no_op (risk borderline)
- `user_1` — risk 0.56 · top: payment_health · agent: no_op (risk borderline)
- `user_8` — risk 0.55 · top: usage_decline · agent: no_op (risk borderline)
- `user_24` — risk 0.55 · top: usage_decline · agent: no_op (risk borderline)

## Engineering plays — stabilization tickets

Drafted from users whose top driver is `error_rate` or who hit 2+ crashes in the last 14 days. Each ticket is a starting point for the dev (no separate engineering team assumed) — verify root cause before shipping a fix.

- [HIGH] `user_51` — [User_51 Experiencing Frequent Crashes Leading to Payment Failure](./engineering-tickets/2026-05-08-user_51-user-51-experiencing-frequent-crashes-le.md)
- [HIGH] `user_46` — [Crash Issue: user_46 Experiences Multiple Crashes After Inactivity Period](./engineering-tickets/2026-05-08-user_46-crash-issue-user-46-experiences-multiple.md)
- [HIGH] `user_28` — [Investigate User_28 Crash Pattern Leading to Subscription Cancellation](./engineering-tickets/2026-05-08-user_28-investigate-user-28-crash-pattern-leadin.md)
