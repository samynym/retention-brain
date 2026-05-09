import type { EventKind } from "@rcrb/core";

// PostHog event names → normalized EventKind.
// $identify/$set/$groupidentify are metadata writes, not user behavior, so they're skipped.
// Subscription / billing-shaped events get mapped to their semantic kinds so the
// risk engine can see them as churn signals — otherwise they'd collapse into
// usage.feature and the cancel/refund signal would be invisible.
// $session_start is the canonical session signal.
// Everything else (custom events, $pageview, $autocapture, $screen) collapses to usage.feature.
const SEMANTIC_MAP: Record<string, EventKind> = {
  subscription_purchased: "subscription.purchase",
  subscription_renewed: "subscription.renewal",
  subscription_cancelled: "subscription.cancel",
  subscription_refunded: "subscription.refund",
  support_ticket_opened: "support.ticket_open",
  review_submitted: "review.submitted",
};

export function classifyPostHogEvent(eventName: string): EventKind | null {
  if (eventName === "$identify" || eventName === "$set" || eventName === "$groupidentify") {
    return null;
  }
  if (eventName === "$session_start") return "usage.session";
  const semantic = SEMANTIC_MAP[eventName];
  if (semantic) return semantic;
  return "usage.feature";
}
