import { Event, EventKind } from "@rcrb/core";
import { randomUUID } from "node:crypto";

export type FieldMapping = {
  user_id: string;
  timestamp: string;
  kind: string;
  id?: string;
  payload?: string;
};

export type ConfigNormalizeOptions = {
  label: string;
  mapping: FieldMapping;
  since?: Date;
  until?: Date;
};

export function normalizeWithConfig(raw: unknown, opts: ConfigNormalizeOptions): Event[] {
  const records = toRecordArray(raw);
  const events: Event[] = [];

  for (const record of records) {
    const userId = readPath(record, opts.mapping.user_id);
    const timestamp = readPath(record, opts.mapping.timestamp);
    // `kind` accepts either a literal EventKind ("support.ticket_open") or a field path.
    // Literal takes precedence because no record property name matches a reserved EventKind.
    const kindRaw = KNOWN_KINDS.has(opts.mapping.kind as EventKind)
      ? opts.mapping.kind
      : readPath(record, opts.mapping.kind);
    const id = opts.mapping.id ? readPath(record, opts.mapping.id) : undefined;
    const payloadRaw = opts.mapping.payload ? readPath(record, opts.mapping.payload) : record;

    if (userId == null || timestamp == null || kindRaw == null) continue;

    const ts = toIsoTimestamp(timestamp);
    if (!ts) continue;
    if (opts.since && new Date(ts) < opts.since) continue;
    if (opts.until && new Date(ts) > opts.until) continue;

    const kind = coerceKind(String(kindRaw));
    if (!kind) continue;

    const candidate = {
      id: id ? String(id) : `${opts.label}:${randomUUID()}`,
      user_id: String(userId),
      kind,
      timestamp: ts,
      source: "mcp" as const,
      payload: payloadRaw && typeof payloadRaw === "object" ? (payloadRaw as Record<string, unknown>) : { value: payloadRaw },
    };
    const parsed = Event.safeParse(candidate);
    if (parsed.success) events.push(parsed.data);
  }

  return events;
}

function toRecordArray(raw: unknown): Record<string, unknown>[] {
  if (Array.isArray(raw)) return raw.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
  if (raw && typeof raw === "object") {
    // common wrappers: { data: [...] }, { items: [...] }, { results: [...] }
    for (const key of ["data", "items", "results", "records", "events", "conversations", "tickets"]) {
      const val = (raw as Record<string, unknown>)[key];
      if (Array.isArray(val)) return val.filter((r): r is Record<string, unknown> => !!r && typeof r === "object");
    }
  }
  return [];
}

// Tiny JSONPath-lite: supports $.a.b, $.a[0].c, dotted "a.b.c" without leading $.
function readPath(record: unknown, path: string): unknown {
  if (record == null) return undefined;
  const cleaned = path.startsWith("$.") ? path.slice(2) : path.startsWith("$") ? path.slice(1) : path;
  if (!cleaned) return record;
  const parts = cleaned.replace(/\[(\d+)\]/g, ".$1").split(".").filter(Boolean);
  let cur: unknown = record;
  for (const part of parts) {
    if (cur == null) return undefined;
    if (typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

function toIsoTimestamp(value: unknown): string | null {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "number") {
    // assume seconds if 10-digit, ms if 13-digit
    const ms = value < 1e12 ? value * 1000 : value;
    const d = new Date(ms);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof value === "string") {
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  return null;
}

const KNOWN_KINDS = new Set(EventKind.options);

function coerceKind(kind: string): EventKind | null {
  if (KNOWN_KINDS.has(kind as EventKind)) return kind as EventKind;
  return null;
}
