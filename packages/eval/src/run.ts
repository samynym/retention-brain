import { buildTimelines, type Event } from "@retention-brain/core";
import { syntheticSource } from "@retention-brain/sources/synthetic";
import { scoreAll } from "@retention-brain/risk-engine";
import { generateAll } from "@retention-brain/intervention-agent";
import { evalPredictions } from "./prediction.js";
import { evalInterventions, type InterventionEval } from "./intervention.js";
import { renderReport } from "./report.js";

const DAY_MS = 86_400_000;

// Note: `withLLMJudge` only governs the LLM judge inside the risk engine
// (one call per user adding ~20% of the score). It does NOT gate intervention
// generation — `withInterventions=true` always uses LLMs (5 calls per user
// for the channel/offer/timing/copy/critic pipeline).
export async function runFullEval(opts: {
  seed: string;
  num_users: number;
  days: number;
  threshold: number;
  withInterventions: boolean;
  withLLMJudge: boolean;
}): Promise<string> {
  const start = new Date("2026-01-01T00:00:00.000Z");
  const src = syntheticSource({
    num_users: opts.num_users,
    days: opts.days,
    seed: opts.seed,
    start_date: start,
  });
  const since = new Date(start.getTime() - 60 * DAY_MS);
  const until = new Date(start.getTime() + opts.days * DAY_MS);

  const events: Event[] = [];
  for await (const e of src.backfill({ since, until })) events.push(e);

  const timelines = buildTimelines(events);
  const scores = await scoreAll(timelines, { useLLM: opts.withLLMJudge });
  const prediction = evalPredictions(scores, src.ground_truth, opts.threshold);

  let intervention: InterventionEval | undefined;
  if (opts.withInterventions) {
    const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));
    const interventions = await generateAll(scores, tlByUser, {
      threshold: opts.threshold,
      max: 20,
    });
    intervention = await evalInterventions(interventions);
  }

  return renderReport({
    seed: opts.seed,
    num_users: opts.num_users,
    days: opts.days,
    prediction,
    intervention,
  });
}
