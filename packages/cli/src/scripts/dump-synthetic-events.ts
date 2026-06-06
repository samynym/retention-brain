#!/usr/bin/env -S tsx
// Dumps the synthetic-source events used to generate examples/briefing-sample.md
// to examples/synthetic-events.jsonl (one JSON Event per line, chronological order).
// Same seed + window as generate-briefing-sample.ts, so the events committed here
// are exactly the events the briefing sample was produced from.
import { writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { syntheticSource } from "@retention-brain/sources/synthetic";
import type { Event } from "@retention-brain/core";

const DAY_MS = 86_400_000;
const DAYS = 30;
const USERS = 80;

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

events.sort((a, b) =>
  a.timestamp < b.timestamp ? -1 : a.timestamp > b.timestamp ? 1 : 0
);

const jsonl = events.map((e) => JSON.stringify(e)).join("\n") + "\n";
const out = resolve(process.cwd(), "examples/synthetic-events.jsonl");
await writeFile(out, jsonl, "utf8");
console.log(`Wrote ${events.length} events for ${USERS} users to ${out}`);
console.log(`Seed: briefing-sample-1 · window: ${start.toISOString().slice(0, 10)} → ${cutoff.toISOString().slice(0, 10)}`);
