import { getModel, type UserTimeline } from "@rcrb/core";
import { generateObject } from "ai";
import { z } from "zod";

const JudgeSchema = z.object({
  narrative_risk: z
    .number()
    .min(0)
    .max(1)
    .describe("Probability the user will churn in the next 30 days, in [0, 1]. Be calibrated — most users are NOT at risk."),
  reason: z.string().describe("One-sentence narrative explanation of the risk assessment."),
});

export type LlmJudgeResult = z.infer<typeof JudgeSchema>;

export class LlmJudgeUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LlmJudgeUnavailableError";
  }
}

const MAX_EVENTS = 30;

export async function llmJudge(timeline: UserTimeline): Promise<LlmJudgeResult> {
  try {
    const recent = timeline.events.slice(-MAX_EVENTS);
    const compact = recent
      .map((e) => `${e.timestamp} ${e.kind} ${stringifyPayload(e.payload)}`)
      .join("\n");

    const { object } = await generateObject({
      model: getModel("structured"),
      schema: JudgeSchema,
      system:
        "You are a churn-risk analyst for a subscription app. " +
        "Read the user's recent event log and produce a calibrated churn-risk probability for the next 30 days. " +
        "Calibration: most users are NOT at risk — a typical loyal user should score below 0.2. " +
        "Score above 0.6 only with clear evidence of disengagement, payment trouble, sustained complaints, or repeated crashes." +
        "\n\nPatterns to recognize (these are easy to miss):" +
        "\n- *Paid-but-not-using*: a successful auto-renewal (subscription.renewal / payment.success) with NO sessions in the surrounding days is HIGH risk, NOT low. The user is paying by inertia and will likely cancel at the next renewal opportunity." +
        "\n- *Recency dominates*: a user who hasn't logged in for 14+ days is at risk regardless of whether they recently renewed. Always compute days-since-last-session explicitly from the event timestamps and weight it heavily." +
        "\n- *Renewals are NOT engagement*. subscription.renewal and payment.success are billing events that happen automatically. Engagement means sessions, feature usage, and support interactions." +
        "\n- *Crashes followed by silence*: one or more error.crash / error.client events followed by no further sessions is a strong churn signal — the user hit the crash and bailed." +
        "\n- Write the `reason` field in plain English. Do NOT call a paid-but-not-using user 'low risk' — that's the most common miss for this kind of agent. Mention the recency gap explicitly if it's >14 days.",
      prompt:
        `User: ${timeline.user_id}\n` +
        `Account created: ${timeline.created_at}\n` +
        `Recent events (oldest → newest, up to ${MAX_EVENTS}):\n` +
        (compact || "(no events)"),
    });

    return object;
  } catch (err) {
    throw new LlmJudgeUnavailableError(err instanceof Error ? err.message : String(err));
  }
}

function stringifyPayload(payload: Record<string, unknown>): string {
  const entries = Object.entries(payload).slice(0, 4);
  if (entries.length === 0) return "";
  return entries
    .map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`)
    .join(" ");
}
