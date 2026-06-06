import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EventStore } from "./storage.js";
import type { Event } from "@retention-brain/core";

function makeEvent(timestamp: string, user_id = "u1"): Event {
  return {
    id: `id-${timestamp}`,
    user_id,
    kind: "subscription.cancel",
    timestamp,
    source: "mcp",
    payload: {},
  };
}

describe("EventStore", () => {
  it("appends and reads back events", async () => {
    const dir = mkdtempSync(join(tmpdir(), "retb-evt-"));
    const store = new EventStore(join(dir, "events.jsonl"));
    await store.append(makeEvent("2026-05-01T00:00:00Z"));
    await store.append(makeEvent("2026-05-05T00:00:00Z"));
    const all = await store.readAll();
    expect(all).toHaveLength(2);
  });

  it("filters by since/until", async () => {
    const dir = mkdtempSync(join(tmpdir(), "retb-evt-"));
    const store = new EventStore(join(dir, "events.jsonl"));
    await store.append(makeEvent("2026-04-01T00:00:00Z"));
    await store.append(makeEvent("2026-05-15T00:00:00Z"));
    await store.append(makeEvent("2026-06-30T00:00:00Z"));
    const window = await store.readAll({
      since: new Date("2026-05-01T00:00:00Z"),
      until: new Date("2026-06-01T00:00:00Z"),
    });
    expect(window).toHaveLength(1);
    expect(window[0]?.timestamp).toBe("2026-05-15T00:00:00Z");
  });

  it("returns [] when file is missing", async () => {
    const dir = mkdtempSync(join(tmpdir(), "retb-evt-"));
    const store = new EventStore(join(dir, "missing.jsonl"));
    expect(await store.readAll()).toEqual([]);
  });
});
