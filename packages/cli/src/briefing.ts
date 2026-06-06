import type { Event, Intervention, UserTimeline } from "@retention-brain/core";
import type { RiskScore } from "@retention-brain/risk-engine";

/** Lightweight reference to a written engineering-tickets/<file>.md. */
export type EngineeringTicketRef = {
  user_id: string;
  filename: string;
  title: string;
  severity: "low" | "medium" | "high";
};

export type BriefingInput = {
  date: Date;
  cutoffIso: string;
  threshold: number;
  totalUsers: number;
  scores: RiskScore[];
  timelinesByUser: Map<string, UserTimeline>;
  interventions: Intervention[];
  enabledSources: string[];
  /** Engineering tickets drafted from crash signals. The renderer references
   *  them by user_id and shows the filename pointer; the ticket bodies
   *  live in their own files under engineering-tickets/. */
  engineeringTickets?: EngineeringTicketRef[];
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
  if (input.engineeringTickets && input.engineeringTickets.length > 0) {
    lines.push("");
    lines.push(
      `**Engineering plays drafted:** ${input.engineeringTickets.length} stabilization ticket(s) in \`./engineering-tickets/\` (crash-driven users; see "Engineering plays" section below).`
    );
  }
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
  const engPlaysByUser = new Map(
    (input.engineeringTickets ?? []).map((t) => [t.user_id, t])
  );

  // Promote users with a drafted intervention into the top-N detail section so
  // the reader sees actionable emails first; users where the agent recommended
  // no_op fall to the tail with their score preserved.
  const sortByActionThenScore = (a: RiskScore, b: RiskScore): number => {
    const aHas = interventionsByUser.has(a.user_id) ? 1 : 0;
    const bHas = interventionsByUser.has(b.user_id) ? 1 : 0;
    if (aHas !== bHas) return bHas - aHas;
    return b.score - a.score;
  };

  // Split flagged users by current subscription state. "Win-back" = latest
  // event is a cancel/refund with no subsequent purchase/renewal. They've
  // already churned; the intervention is a save attempt, not retention.
  const atRisk: RiskScore[] = [];
  const winBack: RiskScore[] = [];
  for (const s of flagged) {
    const timeline = input.timelinesByUser.get(s.user_id);
    if (isPostCancel(timeline)) winBack.push(s);
    else atRisk.push(s);
  }
  atRisk.sort(sortByActionThenScore);
  winBack.sort(sortByActionThenScore);

  renderSection(lines, "At-risk users (not yet canceled)", atRisk, topN, input, interventionsByUser, engPlaysByUser);
  renderSection(lines, "Recent cancels — win-back candidates", winBack, topN, input, interventionsByUser, engPlaysByUser);

  if (input.engineeringTickets && input.engineeringTickets.length > 0) {
    lines.push("## Engineering plays — stabilization tickets");
    lines.push("");
    lines.push(
      "Drafted from users whose top driver is `error_rate` or who hit 2+ crashes in the last 14 days. " +
        "Each ticket is a starting point for the dev (no separate engineering team assumed) — verify root cause before shipping a fix."
    );
    lines.push("");
    const bySeverity = ["high", "medium", "low"] as const;
    const ordered = [...input.engineeringTickets].sort(
      (a, b) => bySeverity.indexOf(a.severity) - bySeverity.indexOf(b.severity)
    );
    for (const t of ordered) {
      lines.push(
        `- [${t.severity.toUpperCase()}] \`${t.user_id}\` — [${t.title}](./engineering-tickets/${t.filename})`
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

function renderSection(
  lines: string[],
  title: string,
  ranked: RiskScore[],
  topN: number,
  input: BriefingInput,
  interventionsByUser: Map<string, Intervention>,
  engPlaysByUser: Map<string, EngineeringTicketRef>
): void {
  if (ranked.length === 0) return;

  const detailN = Math.min(topN, ranked.length);
  lines.push(`## ${title} — top ${detailN} of ${ranked.length}`);
  lines.push("");

  for (let i = 0; i < detailN; i++) {
    const score = ranked[i]!;
    const timeline = input.timelinesByUser.get(score.user_id);
    const intervention = interventionsByUser.get(score.user_id);
    const engPlay = engPlaysByUser.get(score.user_id);
    lines.push(...renderUserBlock(i + 1, score, timeline, intervention, engPlay));
    lines.push("");
  }

  if (ranked.length > topN) {
    lines.push(`### Remaining in this section (${ranked.length - topN})`);
    lines.push("");
    for (const s of ranked.slice(topN)) {
      const top = s.top_signals[0];
      const driver = top ? top.name : "—";
      const hasUserPlay = interventionsByUser.has(s.user_id);
      const hasEngPlay = engPlaysByUser.has(s.user_id);
      let suffix = "";
      if (hasEngPlay && !hasUserPlay) suffix = " · agent: engineering-play only";
      else if (hasEngPlay && hasUserPlay) suffix = " · agent: user + engineering play";
      else if (!hasUserPlay) suffix = " · agent: no_op (risk borderline)";
      lines.push(`- \`${s.user_id}\` — risk ${s.score.toFixed(2)} · top: ${driver}${suffix}`);
    }
    lines.push("");
  }
}

// True iff the user's most recent subscription-state event is a cancel or
// refund with no subsequent purchase/renewal. Reads from the timeline's
// chronologically-sorted events.
function isPostCancel(timeline: UserTimeline | undefined): boolean {
  if (!timeline) return false;
  const stateChanges = timeline.events.filter((e) =>
    e.kind === "subscription.cancel" ||
    e.kind === "subscription.refund" ||
    e.kind === "subscription.purchase" ||
    e.kind === "subscription.renewal"
  );
  if (stateChanges.length === 0) return false;
  const latest = stateChanges[stateChanges.length - 1]!;
  return latest.kind === "subscription.cancel" || latest.kind === "subscription.refund";
}

function renderUserBlock(
  rank: number,
  score: RiskScore,
  timeline: UserTimeline | undefined,
  intervention: Intervention | undefined,
  engPlay: EngineeringTicketRef | undefined
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
  } else if (engPlay) {
    out.push("**Recommended play**");
    out.push(
      `- Engineering action drafted — see [\`engineering-tickets/${engPlay.filename}\`](./engineering-tickets/${engPlay.filename}) (${engPlay.severity}). No user-directed email this run; stabilize first, then re-evaluate.`
    );
    out.push("");
  } else {
    out.push("**Recommended play**");
    out.push("- Agent recommended no action — signal too borderline to warrant a retention email yet. Re-evaluate at next run.");
    out.push("");
  }

  if (intervention && engPlay) {
    // User got both kinds of play: surface the engineering side too so the
    // dev knows there's a stabilization ticket queued alongside the email.
    out.push("**Engineering play**");
    out.push(
      `- [\`engineering-tickets/${engPlay.filename}\`](./engineering-tickets/${engPlay.filename}) (${engPlay.severity})`
    );
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
