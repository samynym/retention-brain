import type { Source } from "@rcrb/sources";
import { sentryApi, type SentryConfig } from "./api.js";
import { mapSentryEvent } from "./map.js";

export function sentrySource(config: SentryConfig): Source {
  const api = sentryApi(config);
  return {
    name: "sentry",
    async *backfill({ since, until }) {
      // Sentry's statsPeriod is relative ("30d"); we post-filter to the precise window.
      for await (const issue of api.listIssues({ statsPeriod: "30d" })) {
        for await (const event of api.listIssueEvents(issue.id)) {
          const ts = new Date(event.dateCreated);
          if (ts < since || ts >= until) continue;
          const mapped = mapSentryEvent(event, issue);
          if (mapped) yield mapped;
        }
      }
    },
  };
}

export type { SentryConfig, SentryIssue, SentryEventDetail } from "./api.js";
export type { SentryErrorKind } from "./kinds.js";
export { mapSentryEvent, classifyError } from "./map.js";
