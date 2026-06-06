import type { UserTimeline } from "@retention-brain/core";
import {
  usageDecline,
  paymentHealth,
  supportSentiment,
  lifecycleStage,
  engagementRecency,
  errorRate,
  type Signal,
} from "./signals/index.js";
import { llmJudge, LlmJudgeUnavailableError } from "./llm-judge.js";

export type RiskScore = {
  user_id: string;
  score: number;
  top_signals: Signal[]; // top 3 by score*weight
  narrative: string;
  llm_judge_available: boolean;
};

export type ScoreOpts = {
  /** When false, skip the LLM judge entirely. Default true. */
  useLLM?: boolean;
  /**
   * ISO timestamp to treat as "now" for time-windowed signals. If omitted,
   * each signal falls back to the user's last event timestamp.
   * `scoreAll` derives a sensible default (max event timestamp across the batch).
   */
  nowIso?: string;
};

const HEURISTIC_WEIGHT = 0.8;
const LLM_WEIGHT = 0.2;

// Per-signal weights live in each signal file. Phase 5.5 tuned values
// (informed by the synthetic adversarial-vs-true-churner separation):
//   usage_decline: 0.35 — strongest discriminator, with absolute-count branch
//   payment_health: 0.40 — fires only on unrecovered failures, no false positives on adversarial
//   engagement_recency: 0.35 — captures lapsing pattern; tradeoff: also fires on silent_lurker
//   error_rate: 0.05 — kept low so crashy_loyal stays cleanly under threshold
//   support_sentiment: 0.05 — sparse but specific signal
//   lifecycle_stage: 0.00 — non-discriminating in synthetic data; all users get the same score
const SIGNAL_FNS = [
  usageDecline,
  paymentHealth,
  supportSentiment,
  lifecycleStage,
  engagementRecency,
  errorRate,
] as const;

export async function scoreUser(
  timeline: UserTimeline,
  opts: ScoreOpts = {}
): Promise<RiskScore> {
  const useLLM = opts.useLLM ?? true;
  const signals = SIGNAL_FNS.map((fn) => fn(timeline, opts.nowIso));
  const heuristic = signals.reduce((sum, s) => sum + s.score * s.weight, 0);

  const topSignals = [...signals]
    .sort((a, b) => b.score * b.weight - a.score * a.weight)
    .slice(0, 3);

  let combined = heuristic;
  let narrative = synthesizeNarrative(topSignals);
  let llm_judge_available = false;

  if (useLLM) {
    try {
      const judge = await llmJudge(timeline);
      combined = heuristic * HEURISTIC_WEIGHT + judge.narrative_risk * LLM_WEIGHT;
      narrative = judge.reason;
      llm_judge_available = true;
    } catch (err) {
      if (!(err instanceof LlmJudgeUnavailableError)) throw err;
      // heuristic-only when judge unavailable — combined stays at heuristic*1.0, no zero substitution
      combined = heuristic;
    }
  }

  return {
    user_id: timeline.user_id,
    score: clamp01(combined),
    top_signals: topSignals,
    narrative,
    llm_judge_available,
  };
}

export async function scoreAll(
  timelines: UserTimeline[],
  opts: ScoreOpts = {}
): Promise<RiskScore[]> {
  const useLLM = opts.useLLM ?? true;
  const nowIso = opts.nowIso ?? deriveBatchNow(timelines);
  const effectiveOpts: ScoreOpts = { ...opts, nowIso };

  if (!useLLM) {
    return Promise.all(timelines.map((t) => scoreUser(t, effectiveOpts)));
  }
  // chunk by 5 to avoid LLM rate limits
  const concurrency = 5;
  const out: RiskScore[] = [];
  for (let i = 0; i < timelines.length; i += concurrency) {
    const chunk = timelines.slice(i, i + concurrency);
    const results = await Promise.all(chunk.map((t) => scoreUser(t, effectiveOpts)));
    out.push(...results);
  }
  return out;
}

function deriveBatchNow(timelines: UserTimeline[]): string | undefined {
  let max: string | undefined;
  for (const t of timelines) {
    if (t.events.length === 0) continue;
    const last = t.events[t.events.length - 1]!.timestamp;
    if (max === undefined || last > max) max = last;
  }
  return max;
}

function clamp01(x: number): number {
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function synthesizeNarrative(topSignals: Signal[]): string {
  const drivers = topSignals.filter((s) => s.score > 0).map((s) => s.name);
  if (drivers.length === 0) return "No notable risk signals detected.";
  return `Top drivers: ${drivers.join(", ")}.`;
}
