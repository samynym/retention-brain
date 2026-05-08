import { describe, it, expect } from "vitest";
import { postHogSource, mapPostHogEvent, classifyPostHogEvent } from "./index.js";
import type { PostHogEvent } from "./api.js";

const HAS_KEYS = Boolean(
  process.env.POSTHOG_PERSONAL_API_KEY && process.env.POSTHOG_PROJECT_ID,
);

describe("posthog classification", () => {
  it("$session_start → usage.session", () => {
    expect(classifyPostHogEvent("$session_start")).toBe("usage.session");
  });
  it("$pageview → usage.feature", () => {
    expect(classifyPostHogEvent("$pageview")).toBe("usage.feature");
  });
  it("$autocapture → usage.feature", () => {
    expect(classifyPostHogEvent("$autocapture")).toBe("usage.feature");
  });
  it("custom event → usage.feature", () => {
    expect(classifyPostHogEvent("export_pdf_clicked")).toBe("usage.feature");
  });
  it("$identify → null", () => {
    expect(classifyPostHogEvent("$identify")).toBeNull();
  });
  it("$set → null", () => {
    expect(classifyPostHogEvent("$set")).toBeNull();
  });
  it("$groupidentify → null", () => {
    expect(classifyPostHogEvent("$groupidentify")).toBeNull();
  });
});

describe("posthog mapping", () => {
  const baseEvent: PostHogEvent = {
    id: "evt_1",
    event: "export_pdf_clicked",
    timestamp: "2026-01-15T12:00:00Z",
    distinct_id: "anon_abc",
  };

  it("maps a custom event to usage.feature with feature name in payload", () => {
    const mapped = mapPostHogEvent(baseEvent);
    expect(mapped).not.toBeNull();
    expect(mapped!.kind).toBe("usage.feature");
    expect(mapped!.payload.feature).toBe("export_pdf_clicked");
    expect(mapped!.id).toBe("posthog_evt_1");
    expect(mapped!.source).toBe("posthog");
    expect(mapped!.timestamp).toBe("2026-01-15T12:00:00Z");
  });

  it("maps $session_start to usage.session and omits feature key", () => {
    const evt: PostHogEvent = { ...baseEvent, id: "evt_2", event: "$session_start" };
    const mapped = mapPostHogEvent(evt);
    expect(mapped!.kind).toBe("usage.session");
    expect(mapped!.payload.feature).toBeUndefined();
  });

  it("returns null for $identify", () => {
    const evt: PostHogEvent = { ...baseEvent, event: "$identify" };
    expect(mapPostHogEvent(evt)).toBeNull();
  });

  it("returns null for $set", () => {
    const evt: PostHogEvent = { ...baseEvent, event: "$set" };
    expect(mapPostHogEvent(evt)).toBeNull();
  });

  it("prefers app_user_id from person properties over distinct_id", () => {
    const evt: PostHogEvent = {
      ...baseEvent,
      person: { properties: { app_user_id: "user_42" } },
    };
    const mapped = mapPostHogEvent(evt);
    expect(mapped!.user_id).toBe("user_42");
    expect(mapped!.payload.app_user_id).toBe("user_42");
  });

  it("falls back to app_user_id from event properties", () => {
    const evt: PostHogEvent = {
      ...baseEvent,
      properties: { app_user_id: "user_77" },
    };
    const mapped = mapPostHogEvent(evt);
    expect(mapped!.user_id).toBe("user_77");
    expect(mapped!.payload.app_user_id).toBe("user_77");
  });

  it("falls back to distinct_id when no app_user_id is present", () => {
    const mapped = mapPostHogEvent(baseEvent);
    expect(mapped!.user_id).toBe("anon_abc");
    expect(mapped!.payload.app_user_id).toBeUndefined();
  });

  it("extracts $email from person properties", () => {
    const evt: PostHogEvent = {
      ...baseEvent,
      person: { properties: { $email: "alice@example.com" } },
    };
    expect(mapPostHogEvent(evt)!.payload.email).toBe("alice@example.com");
  });

  it("extracts $email from event properties when person is absent", () => {
    const evt: PostHogEvent = {
      ...baseEvent,
      properties: { $email: "bob@example.com" },
    };
    expect(mapPostHogEvent(evt)!.payload.email).toBe("bob@example.com");
  });

  it("extracts plain `email` event property as fallback", () => {
    const evt: PostHogEvent = {
      ...baseEvent,
      properties: { email: "carol@example.com" },
    };
    expect(mapPostHogEvent(evt)!.payload.email).toBe("carol@example.com");
  });

  it("passes session_id through from $session_id property", () => {
    const evt: PostHogEvent = {
      ...baseEvent,
      properties: { $session_id: "sess_xyz" },
    };
    expect(mapPostHogEvent(evt)!.payload.session_id).toBe("sess_xyz");
  });

  it("does not set email when nothing matches", () => {
    const mapped = mapPostHogEvent(baseEvent);
    expect(mapped!.payload.email).toBeUndefined();
  });

  it("ignores non-string $email values", () => {
    const evt: PostHogEvent = {
      ...baseEvent,
      properties: { $email: 123 },
    };
    expect(mapPostHogEvent(evt)!.payload.email).toBeUndefined();
  });
});

describe.skipIf(!HAS_KEYS)("posthog source (live)", () => {
  it("backfills events from the configured project", async () => {
    const source = postHogSource({
      personalApiKey: process.env.POSTHOG_PERSONAL_API_KEY!,
      projectId: process.env.POSTHOG_PROJECT_ID!,
      host: process.env.POSTHOG_HOST,
    });
    const events: Array<{ source: string; user_id: string; timestamp: string }> = [];
    for await (const e of source.backfill({
      since: new Date(Date.now() - 7 * 86_400_000),
      until: new Date(),
    })) {
      events.push(e as { source: string; user_id: string; timestamp: string });
      if (events.length >= 5) break;
    }
    for (const e of events) {
      expect(e.source).toBe("posthog");
      expect(typeof e.user_id).toBe("string");
      expect(typeof e.timestamp).toBe("string");
    }
  }, 30_000);
});
