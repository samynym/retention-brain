import { readFileSync } from "node:fs";
import { Event } from "@retention-brain/core";
import type { EventSource } from "./types.js";

/**
 * A file-backed event source for local verification — reads a JSONL of Events
 * (the synthetic dataset) and yields those within the backfill window. Stands
 * in for a real MCP source so the engine→briefing path is testable with no
 * external accounts.
 */
export function fixtureSource(filePath: string, name = "fixture"): EventSource {
  return {
    name,
    async *backfill({ since, until }) {
      const raw = readFileSync(filePath, "utf8");
      for (const line of raw.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed) continue;
        const parsed = Event.safeParse(JSON.parse(trimmed));
        if (!parsed.success) continue;
        const t = new Date(parsed.data.timestamp);
        if (t >= since && t <= until) yield parsed.data;
      }
    },
  };
}
