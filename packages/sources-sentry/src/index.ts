import type { Source } from "@rcrb/sources";
import { sentryApi, type SentryConfig } from "./api.js";
import { mapSentryEvent } from "./map.js";

const DAY_MS = 86_400_000;
// Sentry's statsPeriod accepts "<n>d" up to 90d on most plans; clamp accordingly.
const MAX_DAYS = 90;

export function sentrySource(config: SentryConfig): Source {
  const api = sentryApi(config);
  return {
    name: "sentry",
    async *backfill({ since, until }) {
      const windowDays = Math.ceil((until.getTime() - since.getTime()) / DAY_MS);
      const days = Math.max(1, Math.min(MAX_DAYS, windowDays));
      const statsPeriod = `${days}d`;
      for await (const issue of api.listIssues({ statsPeriod })) {
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
