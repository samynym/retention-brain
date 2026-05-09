import { describe, it, expect } from "vitest";
import { normalizeWithConfig } from "./normalize-config.js";

describe("normalizeWithConfig", () => {
  it("extracts events from a top-level array using JSONPath-lite paths", () => {
    const raw = [
      { id: "t1", user: { external_id: "u1" }, ts: "2026-05-01T10:00:00Z", type: "support.ticket_open" },
      { id: "t2", user: { external_id: "u2" }, ts: "2026-05-02T10:00:00Z", type: "support.ticket_close" },
    ];
    const events = normalizeWithConfig(raw, {
      label: "support",
      mapping: {
        user_id: "$.user.external_id",
        timestamp: "$.ts",
        kind: "$.type",
        id: "$.id",
      },
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.user_id).toBe("u1");
    expect(events[0]?.kind).toBe("support.ticket_open");
    expect(events[0]?.source).toBe("mcp");
    expect(events[0]?.id).toBe("t1");
  });

  it("unwraps common envelope keys (data, items, conversations…)", () => {
    const raw = {
      conversations: [
        { contact: { id: "u9" }, created_at: "2026-04-12T08:00:00Z", kind: "support.ticket_open" },
      ],
    };
    const events = normalizeWithConfig(raw, {
      label: "x",
      mapping: { user_id: "$.contact.id", timestamp: "$.created_at", kind: "$.kind" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.user_id).toBe("u9");
  });

  it("accepts a literal EventKind value in mapping.kind", () => {
    const raw = [
      { uid: "u1", t: "2026-05-01T00:00:00Z" },
      { uid: "u2", t: "2026-05-02T00:00:00Z" },
    ];
    const events = normalizeWithConfig(raw, {
      label: "support",
      mapping: { user_id: "uid", timestamp: "t", kind: "support.ticket_open" },
    });
    expect(events).toHaveLength(2);
    expect(events.every((e) => e.kind === "support.ticket_open")).toBe(true);
  });

  it("skips records with unknown kinds", () => {
    const raw = [
      { uid: "u1", t: "2026-05-01T00:00:00Z", k: "support.ticket_open" },
      { uid: "u2", t: "2026-05-01T00:00:00Z", k: "totally.invented" },
    ];
    const events = normalizeWithConfig(raw, {
      label: "x",
      mapping: { user_id: "uid", timestamp: "t", kind: "k" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.user_id).toBe("u1");
  });

  it("filters by since/until window", () => {
    const raw = [
      { uid: "u1", t: "2026-04-01T00:00:00Z", k: "usage.session" },
      { uid: "u2", t: "2026-05-15T00:00:00Z", k: "usage.session" },
      { uid: "u3", t: "2026-06-30T00:00:00Z", k: "usage.session" },
    ];
    const events = normalizeWithConfig(raw, {
      label: "x",
      mapping: { user_id: "uid", timestamp: "t", kind: "k" },
      since: new Date("2026-05-01T00:00:00Z"),
      until: new Date("2026-06-01T00:00:00Z"),
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.user_id).toBe("u2");
  });

  it("converts numeric epoch timestamps (seconds and ms)", () => {
    const raw = [
      { uid: "u1", t: 1714564800, k: "usage.session" }, // seconds → 2024-05-01
      { uid: "u2", t: 1714564800000, k: "usage.session" }, // ms → same instant
    ];
    const events = normalizeWithConfig(raw, {
      label: "x",
      mapping: { user_id: "uid", timestamp: "t", kind: "k" },
    });
    expect(events).toHaveLength(2);
    expect(events[0]?.timestamp).toBe(events[1]?.timestamp);
  });

  it("skips records missing required fields", () => {
    const raw = [
      { uid: "u1", t: "2026-05-01T00:00:00Z", k: "usage.session" },
      { uid: "u2", k: "usage.session" }, // no timestamp
      { t: "2026-05-01T00:00:00Z", k: "usage.session" }, // no user_id
    ];
    const events = normalizeWithConfig(raw, {
      label: "x",
      mapping: { user_id: "uid", timestamp: "t", kind: "k" },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.user_id).toBe("u1");
  });
});
