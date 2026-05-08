# Retention Briefing — 2026-05-08

**Account summary:** 80 subscribers · 18 flagged at risk (≥0.40) · top driver: usage_decline (9)

_Sources: synthetic · cutoff: 2026-05-08T00:00:00.000Z_

## Top 5 at-risk users

### 1. user51@example.test — risk 0.98

**Why flagged**
- payment_health: Recent payment failure with no subsequent success.
- engagement_recency: Last session 15.4 days ago.
- usage_decline: Early-window 2 sessions → recent 0/7d (decline at low absolute rate).

**Recommended play**
- (no intervention generated — set ANTHROPIC_API_KEY or threshold not met)

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

### 2. user78@example.test — risk 0.69

**Why flagged**
- payment_health: Recent payment failure with no subsequent success.
- usage_decline: Last-7-day session rate 0.43/day vs baseline 1.17/day (drop 63%).
- engagement_recency: Last session 5.0 days ago.

**Recommended play**
- (no intervention generated — set ANTHROPIC_API_KEY or threshold not met)

<details><summary>Evidence</summary>

- 2026-03-27 00:00 · subscription.purchase · currency=USD
- 2026-04-26 22:13 · usage.session
- 2026-04-27 09:00 · usage.session
- 2026-04-28 17:43 · usage.session
- 2026-04-29 07:34 · usage.session
- 2026-04-29 18:51 · usage.session
- 2026-04-30 00:00 · payment.failure · amount=9.99 currency=USD
- 2026-04-30 19:22 · usage.session
- 2026-05-01 01:27 · usage.session
- 2026-05-02 09:30 · usage.session
- 2026-05-03 00:05 · usage.session
- 2026-05-04 00:00 · subscription.cancel · reason=payment_failure

</details>

### 3. user46@example.test — risk 0.68

**Why flagged**
- usage_decline: Last-7-day session rate 0.00/day vs baseline 0.09/day (drop 100%).
- engagement_recency: Last session 15.4 days ago.
- error_rate: 2 crashes in the last 14 days.

**Recommended play**
- (no intervention generated — set ANTHROPIC_API_KEY or threshold not met)

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

### 4. user9@example.test — risk 0.67

**Why flagged**
- usage_decline: Last-7-day session rate 0.00/day vs baseline 0.09/day (drop 100%).
- engagement_recency: Last session 16.2 days ago.

**Recommended play**
- (no intervention generated — set ANTHROPIC_API_KEY or threshold not met)

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

### 5. user28@example.test — risk 0.64

**Why flagged**
- engagement_recency: Last session 17.5 days ago.
- usage_decline: Early-window 4 sessions → recent 0/7d (decline at low absolute rate).
- error_rate: 3 crashes in the last 14 days.

**Recommended play**
- (no intervention generated — set ANTHROPIC_API_KEY or threshold not met)

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

## Remaining flagged users (13)

- `user_45` — risk 0.61 · top: engagement_recency
- `user_60` — risk 0.61 · top: engagement_recency
- `user_68` — risk 0.61 · top: engagement_recency
- `user_69` — risk 0.61 · top: engagement_recency
- `user_63` — risk 0.57 · top: usage_decline
- `user_31` — risk 0.56 · top: usage_decline
- `user_59` — risk 0.56 · top: usage_decline
- `user_16` — risk 0.56 · top: usage_decline
- `user_13` — risk 0.54 · top: payment_health
- `user_8` — risk 0.51 · top: usage_decline
- `user_24` — risk 0.51 · top: usage_decline
- `user_1` — risk 0.50 · top: payment_health
- `user_19` — risk 0.40 · top: usage_decline
