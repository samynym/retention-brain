import type { Intervention } from "@rcrb/core";
import { critique, type Critique } from "@rcrb/intervention-agent";

export type InterventionEval = {
  count: number;
  avg: { relevance: number; personalization: number; tone: number; plausibility: number; aggregate: number };
  accept_rate: number;
};

const ZERO: InterventionEval = {
  count: 0,
  avg: { relevance: 0, personalization: 0, tone: 0, plausibility: 0, aggregate: 0 },
  accept_rate: 0,
};

const CRITIQUE_CONCURRENCY = 5;

// Use Opus to break the Sonnet-judges-Sonnet closed loop in eval mode.
const EVAL_CRITIC_MODEL = "claude-opus-4-7";

export async function evalInterventions(interventions: Intervention[]): Promise<InterventionEval> {
  if (interventions.length === 0) return ZERO;

  // chunk by 5 to avoid LLM rate limits when called with large batches
  const settled: (Critique | null)[] = [];
  for (let i = 0; i < interventions.length; i += CRITIQUE_CONCURRENCY) {
    const chunk = interventions.slice(i, i + CRITIQUE_CONCURRENCY);
    const results = await Promise.all(
      chunk.map(async (intv): Promise<Critique | null> => {
        try {
          return await critique(intv, { model: EVAL_CRITIC_MODEL });
        } catch (err) {
          console.warn(
            `[eval] critique failed for ${intv.user_id}: ${err instanceof Error ? err.message : String(err)}`
          );
          return null;
        }
      })
    );
    settled.push(...results);
  }

  const valid = settled.filter((c): c is Critique => c !== null);
  if (valid.length === 0) return ZERO;

  let r = 0, p = 0, t = 0, pl = 0, agg = 0, accepts = 0;
  for (const c of valid) {
    r += c.scores.relevance;
    p += c.scores.personalization;
    t += c.scores.tone;
    pl += c.scores.plausibility;
    agg += (c.scores.relevance + c.scores.personalization + c.scores.tone + c.scores.plausibility) / 4;
    if (c.recommendation === "accept") accepts += 1;
  }
  const n = valid.length;
  return {
    count: n,
    avg: {
      relevance: r / n,
      personalization: p / n,
      tone: t / n,
      plausibility: pl / n,
      aggregate: agg / n,
    },
    accept_rate: accepts / n,
  };
}
