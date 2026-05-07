import type { Event } from "@rcrb/core";

export type SourceConfig = Record<string, string | undefined>;

export interface Source {
  name: string;
  backfill(opts: { since: Date; until: Date }): AsyncIterable<Event>;
  subscribe?(onEvent: (e: Event) => void): () => void;
}
