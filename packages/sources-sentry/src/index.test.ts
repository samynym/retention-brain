import { describe, it, expect } from "vitest";
import { sentrySource, mapSentryEvent, classifyError } from "./index.js";
import type { SentryEventDetail, SentryIssue } from "./api.js";

const HAS_KEYS = Boolean(
  process.env.SENTRY_AUTH_TOKEN &&
    process.env.SENTRY_ORG_SLUG &&
    process.env.SENTRY_PROJECT_SLUG,
);

describe("sentry classification", () => {
  it("fatal → error.crash", () => {
    expect(classifyError("fatal")).toBe("error.crash");
  });
  it("error → error.client", () => {
    expect(classifyError("error")).toBe("error.client");
  });
  it("undefined → error.client", () => {
    expect(classifyError(undefined)).toBe("error.client");
  });
});

describe("sentry mapping", () => {
  const issue: SentryIssue = {
    id: "iss_1",
    title: "PDFExportError: paywall crashed",
    culprit: "pages/export.tsx",
    permalink: "https://sentry.io/...",
    level: "error",
  };

  it("maps an event with user → normalized Event", () => {
    const evt: SentryEventDetail = {
      id: "evt_1",
      eventID: "abcd1234",
      dateCreated: "2026-01-15T12:00:00Z",
      message: "TypeError: cannot read property 'render'",
      level: "error",
      user: { id: "user_42", email: "alice@example.com" },
    };
    const event = mapSentryEvent(evt, issue);
    expect(event).not.toBeNull();
    expect(event!.kind).toBe("error.client");
    expect(event!.user_id).toBe("user_42");
    expect(event!.payload.email).toBe("alice@example.com");
    expect(event!.payload.issue_id).toBe("iss_1");
    expect(event!.id).toBe("sentry_abcd1234");
    expect(event!.source).toBe("sentry");
    expect(event!.timestamp).toBe("2026-01-15T12:00:00Z");
  });

  it("classifies fatal as error.crash", () => {
    const evt: SentryEventDetail = {
      id: "e",
      dateCreated: "2026-01-15T12:00:00Z",
      level: "fatal",
      user: { id: "u" },
    };
    const event = mapSentryEvent(evt, issue);
    expect(event!.kind).toBe("error.crash");
  });

  it("falls back to user.email when id is absent", () => {
    const evt: SentryEventDetail = {
      id: "e",
      dateCreated: "2026-01-15T12:00:00Z",
      user: { email: "bob@example.com" },
    };
    const event = mapSentryEvent(evt, issue);
    expect(event!.user_id).toBe("bob@example.com");
  });

  it("returns null when there is no user attribution", () => {
    const evt: SentryEventDetail = {
      id: "e",
      dateCreated: "2026-01-15T12:00:00Z",
    };
    expect(mapSentryEvent(evt, issue)).toBeNull();
  });

  it("returns null when user has neither id nor email", () => {
    const evt: SentryEventDetail = {
      id: "e",
      dateCreated: "2026-01-15T12:00:00Z",
      user: { ip_address: "1.2.3.4" },
    };
    expect(mapSentryEvent(evt, issue)).toBeNull();
  });

  it("falls back to issue.level when event.level is missing", () => {
    const evt: SentryEventDetail = {
      id: "e",
      dateCreated: "2026-01-15T12:00:00Z",
      user: { id: "u" },
    };
    const fatalIssue: SentryIssue = { ...issue, level: "fatal" };
    expect(mapSentryEvent(evt, fatalIssue)!.kind).toBe("error.crash");
  });

  it("uses event.id when eventID is absent", () => {
    const evt: SentryEventDetail = {
      id: "raw_id_only",
      dateCreated: "2026-01-15T12:00:00Z",
      user: { id: "u" },
    };
    expect(mapSentryEvent(evt, issue)!.id).toBe("sentry_raw_id_only");
  });
});

describe.skipIf(!HAS_KEYS)("sentry source (live)", () => {
  it("backfills events from a sandbox project", async () => {
    const source = sentrySource({
      authToken: process.env.SENTRY_AUTH_TOKEN!,
      orgSlug: process.env.SENTRY_ORG_SLUG!,
      projectSlug: process.env.SENTRY_PROJECT_SLUG!,
    });
    const events: Array<{ source: string; user_id: string; timestamp: string }> = [];
    for await (const e of source.backfill({
      since: new Date(Date.now() - 14 * 86_400_000),
      until: new Date(),
    })) {
      events.push(e as { source: string; user_id: string; timestamp: string });
      if (events.length >= 5) break;
    }
    for (const e of events) {
      expect(e.source).toBe("sentry");
      expect(typeof e.user_id).toBe("string");
      expect(typeof e.timestamp).toBe("string");
    }
  }, 30_000);
});
