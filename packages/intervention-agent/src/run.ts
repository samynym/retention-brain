import type { Intervention, UserTimeline } from "@rcrb/core";
import type { RiskScore } from "@rcrb/risk-engine";
import { decideChannel } from "./decide-channel.js";
import { decideOffer } from "./decide-offer.js";
import { decideTiming } from "./decide-timing.js";
import { compose } from "./compose.js";
import { critique } from "./critic.js";

export async function generateIntervention(
  risk: RiskScore,
  timeline: UserTimeline
): Promise<Intervention | null> {
  try {
    const channelDecision = await decideChannel(risk, timeline);
    if (channelDecision.channel === "no_op") return null;

    const offerDecision = await decideOffer(risk, channelDecision.channel);
    const timingDecision = await decideTiming(risk, channelDecision.channel);
    const copy = await compose({
      risk,
      channel: channelDecision.channel,
      offer: offerDecision,
      user_email: timeline.email,
    });

    const reasoning = [
      `channel: ${channelDecision.reason}`,
      `offer: ${offerDecision.reason}`,
      `timing: ${timingDecision.reason}`,
    ].join(" | ");

    const intervention: Intervention = {
      user_id: risk.user_id,
      risk_score: risk.score,
      channel: channelDecision.channel,
      offer: {
        kind: offerDecision.kind,
        ...(offerDecision.value !== undefined ? { value: offerDecision.value } : {}),
      },
      timing: timingDecision.timing,
      copy,
      reasoning,
      predicted_lift: {
        direction: "positive",
        confidence: "low",
        note: "directional only — no historical baseline",
      },
    };

    // Critique runs to surface quality concerns; we log on warn/reject but don't gate.
    try {
      const review = await critique(intervention);
      if (review.recommendation !== "accept") {
        console.warn(
          `[intervention-agent] ${risk.user_id}: critic=${review.recommendation} (${review.notes})`
        );
      }
    } catch (err) {
      console.warn(
        `[intervention-agent] ${risk.user_id}: critic failed: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    return intervention;
  } catch (err) {
    console.warn(
      `[intervention-agent] ${risk.user_id}: skipped due to error: ${err instanceof Error ? err.message : String(err)}`
    );
    return null;
  }
}

export async function generateAll(
  risks: RiskScore[],
  timelinesByUser: Map<string, UserTimeline>,
  opts: { threshold: number; max?: number }
): Promise<Intervention[]> {
  const eligible = risks
    .filter((r) => r.score >= opts.threshold)
    .sort((a, b) => b.score - a.score);
  const capped = opts.max !== undefined ? eligible.slice(0, opts.max) : eligible;

  const out: Intervention[] = [];
  for (const risk of capped) {
    const timeline = timelinesByUser.get(risk.user_id);
    if (!timeline) continue;
    const intervention = await generateIntervention(risk, timeline);
    if (intervention) out.push(intervention);
  }
  return out;
}
