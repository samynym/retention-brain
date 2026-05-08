import type { EventKind } from "@rcrb/core";

// PostHog event names → normalized EventKind.
// $identify/$set/$groupidentify are metadata writes, not user behavior, so they're skipped.
// $session_start (when emitted by the JS SDK) is the canonical session signal.
// Everything else (custom events, $pageview, $autocapture, $screen) collapses to usage.feature.
export function classifyPostHogEvent(eventName: string): EventKind | null {
  if (eventName === "$identify" || eventName === "$set" || eventName === "$groupidentify") {
    return null;
  }
  if (eventName === "$session_start") return "usage.session";
  return "usage.feature";
}
