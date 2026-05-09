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
        "Be calibrated: most users are NOT at risk — a typical loyal user should score below 0.2. " +
        "Only assign high scores (>0.6) when there is clear evidence of disengagement, payment trouble, sustained complaints, or repeated crashes.",
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
