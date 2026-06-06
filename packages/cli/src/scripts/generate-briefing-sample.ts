#!/usr/bin/env -S tsx
// Generates the canonical examples/briefing-sample.md from synthetic data.
// When an LLM key is present, generates the full operator-tier briefing
// (LLM judge + drafted intervention copy for top-N at-risk users PLUS
// engineering stabilization tickets for crash-driven users, written to
// examples/engineering-tickets/). Without a key, falls back to heuristic-
// only scoring with no LLM-drafted artifacts.
import "dotenv/config";
import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { syntheticSource } from "@retention-brain/sources/synthetic";
import { buildTimelines, type Event, type Intervention } from "@retention-brain/core";
import { scoreAll } from "@retention-brain/risk-engine";
import {
  generateAll,
  generateEngineeringTicket,
  type EngineeringTicket,
} from "@retention-brain/intervention-agent";
import type { EngineeringTicketRef } from "../briefing.js";
import { renderBriefing } from "../briefing.js";

const DAY_MS = 86_400_000;
const DAYS = 30;
const USERS = 80;
const THRESHOLD = 0.4;
// The briefing renderer shows top 5 per section (at-risk + win-back).
// Generate top 10 user-plays so both sections have plays attempted for the
// users that get rendered, not just the top 5 globally by score.
const TOP_N = 10;
const ENG_TICKETS_DIR = "examples/engineering-tickets";

const hasLLMKey = Boolean(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);

const start = new Date("2026-04-08T00:00:00.000Z");
const cutoff = new Date(start.getTime() + DAYS * DAY_MS);
const src = syntheticSource({
  num_users: USERS,
  days: DAYS,
  seed: "briefing-sample-1",
  start_date: start,
});

const events: Event[] = [];
for await (const e of src.backfill({
  since: new Date(start.getTime() - 60 * DAY_MS),
  until: cutoff,
})) {
  events.push(e);
}

const timelines = buildTimelines(events);
const scores = await scoreAll(timelines, {
  useLLM: hasLLMKey,
  nowIso: cutoff.toISOString(),
});
const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));

let interventions: Intervention[] = [];
const engTicketRefs: EngineeringTicketRef[] = [];

if (hasLLMKey) {
  console.log(`LLM key detected — generating intervention copy for top-${TOP_N} at-risk users...`);
  interventions = await generateAll(scores, tlByUser, { threshold: THRESHOLD, max: TOP_N });
  console.log(`Generated ${interventions.length} user-directed interventions.`);

  console.log("Checking top-${TOP_N} users for engineering plays (crash-driven)...");
  const eligible = scores
    .filter((s) => s.score >= THRESHOLD)
    .sort((a, b) => b.score - a.score)
    .slice(0, TOP_N);

  const writtenTickets: EngineeringTicket[] = [];
  for (const risk of eligible) {
    const timeline = tlByUser.get(risk.user_id);
    if (!timeline) continue;
    try {
      const ticket = await generateEngineeringTicket(risk, timeline, { date: cutoff });
      if (!ticket) continue;
      writtenTickets.push(ticket);
    } catch (err) {
      console.warn(
        `[engineering-play] ${risk.user_id}: skipped due to error: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // Wipe stale tickets before writing — keeps the committed sample deterministic
  // even when LLM title-slugs drift between runs.
  const ticketsDir = resolve(process.cwd(), ENG_TICKETS_DIR);
  try {
    const stale = await readdir(ticketsDir);
    for (const f of stale) {
      if (f.endsWith(".md")) await rm(resolve(ticketsDir, f));
    }
  } catch {
    // dir doesn't exist yet — no-op
  }

  if (writtenTickets.length > 0) {
    await mkdir(ticketsDir, { recursive: true });
    for (const t of writtenTickets) {
      const ticketPath = resolve(ticketsDir, t.filename);
      await writeFile(ticketPath, t.markdown, "utf8");
      engTicketRefs.push({
        user_id: t.user_id,
        filename: t.filename,
        title: t.copy.title,
        severity: t.copy.severity,
      });
    }
    console.log(`Wrote ${writtenTickets.length} engineering ticket(s) to ${ENG_TICKETS_DIR}/`);
  } else {
    console.log("No engineering plays drafted (no users met the crash-signal threshold).");
  }
} else {
  console.log("No LLM key detected — generating heuristic-only sample with no LLM-drafted artifacts.");
  console.log("Set ANTHROPIC_API_KEY or OPENAI_API_KEY to regenerate with full operator-tier output.");
}

const md = renderBriefing({
  date: cutoff,
  cutoffIso: cutoff.toISOString(),
  threshold: THRESHOLD,
  totalUsers: timelines.length,
  scores,
  timelinesByUser: tlByUser,
  interventions,
  engineeringTickets: engTicketRefs,
  enabledSources: ["synthetic"],
});

const out = resolve(process.cwd(), "examples/briefing-sample.md");
await writeFile(out, md, "utf8");
console.log(`Wrote ${out}`);
