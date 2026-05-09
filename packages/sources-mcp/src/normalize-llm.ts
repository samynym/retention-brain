import { generateObject } from "ai";
import { z } from "zod";
import { Event, EventKind, getModel } from "@rcrb/core";
import { randomUUID } from "node:crypto";

const NormalizedEvent = z.object({
  user_id: z.string(),
  kind: EventKind,
  timestamp: z.string(),
  payload: z.record(z.unknown()).optional(),
});

const NormalizedBatch = z.object({
  events: z.array(NormalizedEvent),
});

export type LLMNormalizeOptions = {
  label: string;
  hint?: string;
  since?: Date;
  until?: Date;
};

export async function normalizeWithLLM(raw: unknown, opts: LLMNormalizeOptions): Promise<Event[]> {
  const records = sliceForPrompt(raw);
  if (records.length === 0) return [];

  const { object } = await generateObject({
    model: getModel("structured"),
    schema: NormalizedBatch,
    system:
      "You convert raw records from an arbitrary external tool into a strict event log. " +
      "Each output event must map to exactly one of the allowed kinds. " +
      "Skip records that do not belong to a user lifecycle (no user identifier or no timestamp). " +
      "Do not invent values — if a field is missing, drop the record.",
    prompt:
      `Source label: ${opts.label}\n` +
      (opts.hint ? `Hint about this source: ${opts.hint}\n` : "") +
      `Allowed kinds: ${EventKind.options.join(", ")}\n\n` +
      `Raw records (JSON):\n` +
      `\`\`\`json\n${JSON.stringify(records, null, 2)}\n\`\`\`\n\n` +
      `Return one event per relevant record. user_id should be the most stable identifier you can find (email, app user id, external id). timestamp must be ISO-8601.`,
  });

  const events: Event[] = [];
  for (const ev of object.events) {
    const ts = toIsoTimestamp(ev.timestamp);
    if (!ts) continue;
    if (opts.since && new Date(ts) < opts.since) continue;
    if (opts.until && new Date(ts) > opts.until) continue;

    const candidate = {
      id: `${opts.label}:${randomUUID()}`,
      user_id: ev.user_id,
      kind: ev.kind,
      timestamp: ts,
      source: "mcp" as const,
      payload: ev.payload ?? {},
    };
    const parsed = Event.safeParse(candidate);
    if (parsed.success) events.push(parsed.data);
  }
  return events;
}

const MAX_RECORDS_PER_BATCH = 50;

function sliceForPrompt(raw: unknown): unknown[] {
  if (Array.isArray(raw)) return raw.slice(0, MAX_RECORDS_PER_BATCH);
  if (raw && typeof raw === "object") {
    for (const key of ["data", "items", "results", "records", "events", "conversations", "tickets"]) {
      const val = (raw as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val.slice(0, MAX_RECORDS_PER_BATCH);
    }
    return [raw];
  }
  return [];
}

function toIsoTimestamp(value: unknown): string | null {
  if (typeof value !== "string" && typeof value !== "number") return null;
  const d = typeof value === "number" ? new Date(value < 1e12 ? value * 1000 : value) : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}
