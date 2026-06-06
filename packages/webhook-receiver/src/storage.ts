import { appendFile, mkdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname } from "node:path";
import { Event } from "@retention-brain/core";

export class EventStore {
  constructor(private readonly path: string) {}

  async append(event: Event): Promise<void> {
    if (!existsSync(dirname(this.path))) {
      await mkdir(dirname(this.path), { recursive: true });
    }
    await appendFile(this.path, JSON.stringify(event) + "\n", "utf8");
  }

  async readAll(opts: { since?: Date; until?: Date } = {}): Promise<Event[]> {
    if (!existsSync(this.path)) return [];
    const raw = await readFile(this.path, "utf8");
    const events: Event[] = [];
    for (const line of raw.split("\n")) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      let parsed: unknown;
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        continue;
      }
      const result = Event.safeParse(parsed);
      if (!result.success) continue;
      const ts = new Date(result.data.timestamp);
      if (opts.since && ts < opts.since) continue;
      if (opts.until && ts > opts.until) continue;
      events.push(result.data);
    }
    return events;
  }

  async size(): Promise<number> {
    if (!existsSync(this.path)) return 0;
    const s = await stat(this.path);
    return s.size;
  }
}
