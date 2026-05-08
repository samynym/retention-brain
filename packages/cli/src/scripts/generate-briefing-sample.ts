#!/usr/bin/env -S tsx
// Generates the canonical examples/briefing-sample.md from synthetic data.
// Used as the install artifact when no real keys are configured.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { syntheticSource } from "@rcrb/sources/synthetic";
import { buildTimelines, type Event } from "@rcrb/core";
import { scoreAll } from "@rcrb/risk-engine";
import { renderBriefing } from "../briefing.js";

const DAY_MS = 86_400_000;
const DAYS = 30;
const USERS = 80;
const THRESHOLD = 0.4;

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
const scores = await scoreAll(timelines, { useLLM: false, nowIso: cutoff.toISOString() });
const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));

const md = renderBriefing({
  date: cutoff,
  cutoffIso: cutoff.toISOString(),
  threshold: THRESHOLD,
  totalUsers: timelines.length,
  scores,
  timelinesByUser: tlByUser,
  interventions: [],
  enabledSources: ["synthetic"],
});

const out = resolve(process.cwd(), "examples/briefing-sample.md");
await writeFile(out, md, "utf8");
console.log(`Wrote ${out}`);
