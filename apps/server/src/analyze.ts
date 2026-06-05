import {
  buildTimelines,
  hasLLMKey,
  type Event,
  type Intervention,
} from "@retention-brain/core";
import { scoreAll } from "@retention-brain/risk-engine";
import { generateAll } from "@retention-brain/intervention-agent";
import type { EventSource } from "./sources/types.js";
import type { Briefing, BriefingUser, EvidenceEvent } from "./types.js";

const DAY_MS = 86_400_000;
const BACKFILL_DAYS = 60;
const HIGH = 0.7;
const MEDIUM = 0.5;

export type AnalyzeOpts = {
  /** "now" cutoff for time-windowed signals; defaults to current time */
  now?: Date;
  /** flag users at or above this risk; default 0.4 */
  threshold?: number;
  /** cap interventions drafted (cost control); default 20 */
  maxInterventions?: number;
  /** whether the risk judge uses the LLM (0.2 weight); default = key present */
  scoreUseLLM?: boolean;
  /** whether to draft interventions for flagged users; default = key present */
  draftInterventions?: boolean;
};

/**
 * The full pipeline as a function: sources → events → timelines → risk →
 * interventions → a Briefing JSON. Mirrors packages/cli run.ts, but returns
 * structured data instead of writing Markdown. Raw events live only in memory
 * for the duration of the call.
 */
export async function analyze(
  sources: EventSource[],
  opts: AnalyzeOpts = {},
): Promise<Briefing> {
  const now = opts.now ?? new Date();
  const threshold = opts.threshold ?? 0.4;
  const maxInterventions = opts.maxInterventions ?? 20;
  const scoreUseLLM = opts.scoreUseLLM ?? hasLLMKey();
  const draftInterventions = opts.draftInterventions ?? hasLLMKey();
  const since = new Date(now.getTime() - BACKFILL_DAYS * DAY_MS);

  // A failing source (expired token, bad key) must not kill the whole run —
  // skip it, record a warning, and keep the briefing for the sources that work.
  const events: Event[] = [];
  const warnings: { source: string; error: string }[] = [];
  for (const src of sources) {
    try {
      for await (const e of src.backfill({ since, until: now })) {
        events.push(e);
      }
    } catch (err) {
      warnings.push({ source: src.name, error: err instanceof Error ? err.message : String(err) });
    }
  }

  const timelines = buildTimelines(events);
  const scores = await scoreAll(timelines, {
    useLLM: scoreUseLLM,
    nowIso: now.toISOString(),
  });

  const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));
  const flagged = scores
    .filter((s) => s.score >= threshold)
    .sort((a, b) => b.score - a.score);

  let interventions: Intervention[] = [];
  if (draftInterventions && flagged.length > 0) {
    interventions = await generateAll(scores, tlByUser, {
      threshold,
      max: maxInterventions,
    });
  }
  const ivByUser = new Map(interventions.map((i) => [i.user_id, i]));

  const users: BriefingUser[] = flagged.map((risk) => {
    const tl = tlByUser.get(risk.user_id);
    return {
      user_id: risk.user_id,
      email: tl?.email ?? null,
      risk,
      intervention: ivByUser.get(risk.user_id) ?? null,
      events: (tl?.events ?? []).map(toEvidence),
    };
  });

  return {
    generated_at: new Date().toISOString(),
    cutoff_iso: now.toISOString(),
    account: {
      total_users: timelines.length,
      flagged: flagged.length,
      high: flagged.filter((s) => s.score >= HIGH).length,
      medium: flagged.filter((s) => s.score >= MEDIUM && s.score < HIGH).length,
    },
    users,
    warnings,
  };
}

/** Compact a raw Event into the evidence row the UI shows. */
function toEvidence(e: Event): EvidenceEvent {
  return {
    timestamp: e.timestamp,
    kind: e.kind,
    detail: summarizePayload(e.payload),
  };
}

function summarizePayload(payload: Record<string, unknown>): string | undefined {
  const parts: string[] = [];
  for (const key of ["amount", "currency", "feature", "product", "reason", "sentiment"]) {
    const v = payload[key];
    if (v !== undefined && v !== null && v !== "") {
      parts.push(key === "amount" ? `$${v}` : `${key}=${v}`);
    }
  }
  return parts.length ? parts.join(" · ") : undefined;
}
