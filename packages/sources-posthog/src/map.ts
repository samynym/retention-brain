import type { Event } from "@rcrb/core";
import type { PostHogEvent, PostHogPerson } from "./api.js";
import { classifyPostHogEvent } from "./kinds.js";

function extractEmail(
  person: PostHogPerson | null | undefined,
  eventProps: Record<string, unknown> | undefined,
): string | undefined {
  // $email is the PostHog convention; fall back to a plain `email` event property.
  const fromPerson = person?.properties?.["$email"];
  if (typeof fromPerson === "string") return fromPerson;
  const fromEvent = eventProps?.["$email"] ?? eventProps?.["email"];
  return typeof fromEvent === "string" ? fromEvent : undefined;
}

function extractAppUserId(
  person: PostHogPerson | null | undefined,
  eventProps: Record<string, unknown> | undefined,
): string | undefined {
  const fromPerson = person?.properties?.["app_user_id"];
  if (typeof fromPerson === "string") return fromPerson;
  const fromEvent = eventProps?.["app_user_id"];
  return typeof fromEvent === "string" ? fromEvent : undefined;
}

export function mapPostHogEvent(event: PostHogEvent): Event | null {
  const kind = classifyPostHogEvent(event.event);
  if (!kind) return null;

  const props = event.properties;
  const email = extractEmail(event.person ?? undefined, props);
  const appUserId = extractAppUserId(event.person ?? undefined, props);

  // Prefer app_user_id for cross-source matching; fall back to PostHog's distinct_id.
  const userId = appUserId ?? event.distinct_id;

  const payload: Record<string, unknown> = {};
  if (kind === "usage.feature") payload.feature = event.event;
  if (email) payload.email = email;
  if (appUserId) payload.app_user_id = appUserId;
  const sessionId = props?.["$session_id"];
  if (sessionId !== undefined) payload.session_id = sessionId;

  return {
    id: `posthog_${event.id}`,
    user_id: userId,
    kind,
    timestamp: event.timestamp,
    source: "posthog",
    payload,
  };
}
