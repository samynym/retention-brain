import type { Event } from "@rcrb/core";
import type { SentryIssue, SentryEventDetail } from "./api.js";
import type { SentryErrorKind } from "./kinds.js";

export function classifyError(level: string | undefined): SentryErrorKind {
  return level === "fatal" ? "error.crash" : "error.client";
}

export function mapSentryEvent(event: SentryEventDetail, issue: SentryIssue): Event | null {
  const user = event.user;
  // No user attribution → not actionable for per-user retention.
  if (!user) return null;
  const userId = user.id ?? user.email ?? null;
  if (!userId) return null;

  const kind = classifyError(event.level ?? issue.level);

  const payload: Record<string, unknown> = {
    issue_id: issue.id,
    issue_title: issue.title ?? event.title ?? "",
    error_message: event.message ?? "",
    level: event.level ?? issue.level ?? "error",
  };
  if (user.email) payload.email = user.email;
  if (issue.culprit) payload.culprit = issue.culprit;
  if (issue.permalink) payload.permalink = issue.permalink;

  return {
    id: `sentry_${event.eventID ?? event.id}`,
    user_id: userId,
    kind,
    timestamp: event.dateCreated,
    source: "sentry",
    payload,
  };
}
