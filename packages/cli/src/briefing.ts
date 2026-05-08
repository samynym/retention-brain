import type { Event, Intervention, UserTimeline } from "@rcrb/core";
import type { RiskScore } from "@rcrb/risk-engine";

export type BriefingInput = {
  date: Date;
  cutoffIso: string;
  threshold: number;
  totalUsers: number;
  scores: RiskScore[];
  timelinesByUser: Map<string, UserTimeline>;
  interventions: Intervention[];
  enabledSources: string[];
  /** Top-N at-risk users to render in detail (default 5). */
  topN?: number;
};

const DEFAULT_TOP_N = 5;
const MAX_EVIDENCE_EVENTS = 12;

export function renderBriefing(input: BriefingInput): string {
  const topN = input.topN ?? DEFAULT_TOP_N;
  const flagged = input.scores
    .filter((s) => s.score >= input.threshold)
    .sort((a, b) => b.score - a.score);

  const sigCounts = new Map<string, number>();
  for (const s of flagged) {
    const top = s.top_signals[0];
    if (!top) continue;
    sigCounts.set(top.name, (sigCounts.get(top.name) ?? 0) + 1);
  }
  const topDriverEntry = [...sigCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  const topDriver = topDriverEntry ? `${topDriverEntry[0]} (${topDriverEntry[1]})` : "none";

  const dateStr = input.date.toISOString().slice(0, 10);
  const lines: string[] = [];
  lines.push(`# Retention Briefing — ${dateStr}`);
  lines.push("");
  lines.push(
    `**Account summary:** ${input.totalUsers} subscribers · ${flagged.length} flagged at risk (≥${input.threshold.toFixed(2)}) · top driver: ${topDriver}`
  );
  lines.push("");
  lines.push(
    `_Sources: ${input.enabledSources.length > 0 ? input.enabledSources.join(", ") : "(none)"} · cutoff: ${input.cutoffIso}_`
  );
  lines.push("");

  if (flagged.length === 0) {
    lines.push("No users flagged at the current threshold.");
    lines.push("");
    return lines.join("\n");
  }

  const interventionsByUser = new Map(input.interventions.map((i) => [i.user_id, i]));

  lines.push(`## Top ${Math.min(topN, flagged.length)} at-risk users`);
  lines.push("");

  for (let i = 0; i < Math.min(topN, flagged.length); i++) {
    const score = flagged[i]!;
    const timeline = input.timelinesByUser.get(score.user_id);
    const intervention = interventionsByUser.get(score.user_id);
    lines.push(...renderUserBlock(i + 1, score, timeline, intervention));
    lines.push("");
  }

  if (flagged.length > topN) {
    lines.push(`## Remaining flagged users (${flagged.length - topN})`);
    lines.push("");
    for (const s of flagged.slice(topN)) {
      const top = s.top_signals[0];
      const driver = top ? top.name : "—";
      lines.push(`- \`${s.user_id}\` — risk ${s.score.toFixed(2)} · top: ${driver}`);
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderUserBlock(
  rank: number,
  score: RiskScore,
  timeline: UserTimeline | undefined,
  intervention: Intervention | undefined
): string[] {
  const out: string[] = [];
  const label = timeline?.email ?? score.user_id;
  out.push(`### ${rank}. ${label} — risk ${score.score.toFixed(2)}`);
  out.push("");
  out.push("**Why flagged**");
  const drivers = score.top_signals.filter((s) => s.score > 0);
  if (drivers.length === 0) {
    out.push("- (no positive heuristic signals — narrative-only)");
  } else {
    for (const s of drivers) {
      out.push(`- ${s.name}: ${s.reason}`);
    }
  }
  if (score.narrative && score.narrative !== synthesizeNarrativeFallback(drivers)) {
    out.push("");
    out.push(`> ${score.narrative}`);
  }
  out.push("");

  if (intervention) {
    out.push("**Recommended play**");
    const offerStr =
      intervention.offer.kind === "none"
        ? "no offer"
        : intervention.offer.value !== undefined
          ? `${intervention.offer.kind}=${intervention.offer.value}`
          : intervention.offer.kind;
    out.push(`- Channel: ${intervention.channel}`);
    out.push(`- Offer: ${offerStr}`);
    out.push(`- Timing: ${intervention.timing}`);
    if (intervention.critique) {
      const c = intervention.critique;
      const avg =
        (c.scores.relevance + c.scores.personalization + c.scores.tone + c.scores.plausibility) /
        4;
      out.push(`- Critic verdict: ${c.recommendation} (${avg.toFixed(1)}/5)`);
    }
    out.push("");
    if (intervention.copy.subject) {
      out.push(`**Subject:** ${intervention.copy.subject}`);
    }
    out.push("**Body:**");
    out.push("");
    out.push("```");
    out.push(intervention.copy.body);
    out.push("```");
    out.push("");
  } else {
    out.push("**Recommended play**");
    out.push("- (no intervention generated — set ANTHROPIC_API_KEY or threshold not met)");
    out.push("");
  }

  if (timeline) {
    out.push("<details><summary>Evidence</summary>");
    out.push("");
    const evidence = pickEvidence(timeline.events);
    for (const e of evidence) {
      out.push(`- ${formatEventLine(e)}`);
    }
    out.push("");
    out.push("</details>");
  }
  return out;
}

function synthesizeNarrativeFallback(drivers: { name: string }[]): string {
  if (drivers.length === 0) return "No notable risk signals detected.";
  return `Top drivers: ${drivers.map((d) => d.name).join(", ")}.`;
}

// Evidence selection: prioritize churn-relevant kinds, then take most recent.
const EVIDENCE_KIND_PRIORITY: Record<string, number> = {
  "subscription.cancel": 0,
  "subscription.refund": 0,
  "payment.failure": 1,
  "payment.retry": 1,
  "error.crash": 2,
  "support.ticket_open": 2,
  "subscription.trial_end": 3,
  "subscription.renewal": 4,
  "subscription.purchase": 4,
  "usage.session": 5,
  "usage.feature": 6,
};

function pickEvidence(events: Event[]): Event[] {
  const ranked = [...events].sort((a, b) => {
    const pa = EVIDENCE_KIND_PRIORITY[a.kind] ?? 9;
    const pb = EVIDENCE_KIND_PRIORITY[b.kind] ?? 9;
    if (pa !== pb) return pa - pb;
    // newer first within same priority
    return a.timestamp < b.timestamp ? 1 : a.timestamp > b.timestamp ? -1 : 0;
  });
  const selected = ranked.slice(0, MAX_EVIDENCE_EVENTS);
  // restore chronological order in display
  selected.sort((a, b) => (a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0));
  return selected;
}

function formatEventLine(e: Event): string {
  const ts = e.timestamp.replace("T", " ").slice(0, 16);
  const detail = formatPayloadDetail(e);
  return detail ? `${ts} · ${e.kind} · ${detail}` : `${ts} · ${e.kind}`;
}

function formatPayloadDetail(e: Event): string {
  const p = e.payload as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["reason", "feature", "amount", "currency", "type", "sentiment"]) {
    const v = p[key];
    if (v !== undefined && v !== null && v !== "") parts.push(`${key}=${String(v)}`);
  }
  return parts.join(" ");
}
