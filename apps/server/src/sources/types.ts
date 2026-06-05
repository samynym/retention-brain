import type { Event } from "@retention-brain/core";

/**
 * Minimal event-source contract the analyze pipeline consumes — matches what
 * the CLI's MCP sources expose (`name` + `backfill(range)`), so a fixture
 * source and a real MCP source are interchangeable.
 */
export type EventSource = {
  name: string;
  backfill(range: { since: Date; until: Date }): AsyncIterable<Event>;
};
