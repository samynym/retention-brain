# Intervention Eval Rubric (v1)

Each dimension scored 1–5.

## Relevance (does the play match the actual risk signals?)
- 5: directly addresses the dominant signal (e.g., usage_decline → re-engagement; payment_failure → dunning fix)
- 3: addresses a real signal but not the dominant one
- 1: ignores the signals entirely; generic retention spam

## Personalization (does the copy reflect this user specifically?)
- 5: references actual behavior or context from the timeline
- 3: feels persona-tuned but could fit many users
- 1: pure template; mail-merge-ready

## Tone (warm, specific, not desperate or pushy?)
- 5: feels like a thoughtful human wrote it
- 3: professional but bland
- 1: pushy, guilt-trippy, or condescending

## Plausibility (would a thoughtful PM send this?)
- 5: yes, would A/B test
- 3: needs minor edits
- 1: would never ship

## Aggregate
- accept: avg ≥ 4
- revise: 3 ≤ avg < 4
- reject: avg < 3
