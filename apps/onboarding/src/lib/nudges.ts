import type { SourceCategory } from "../fixtures/sources";

/**
 * Category-aware nudges. The briefing's value compounds as more signal sources
 * connect, so the banner names the single most valuable thing still missing —
 * never a generic "connect more". Mirrors the upgrade path in PRODUCT.md
 * (billing tells you *that* they churn; analytics/errors/support tell you *why*).
 */

export type Nudge = {
  tone: "prompt" | "complete";
  headline: string;
  body: string;
};

export function briefingNudge(cats: Set<SourceCategory>): Nudge | null {
  const analytics = cats.has("analytics");
  const errors = cats.has("errors");

  // Billing only — the biggest leap is knowing *why*, not just *that*.
  if (!analytics && !errors) {
    return {
      tone: "prompt",
      headline: "You're seeing who's at risk. Connect analytics to see why.",
      body: "Right now the briefing leans on billing state. Add PostHog, Mixpanel, or Amplitude and each user's “why” fills in with the actual usage decline behind the churn — not just that it's happening.",
    };
  }

  // Billing + analytics, but no error signal yet.
  if (analytics && !errors) {
    return {
      tone: "prompt",
      headline: "Connect Sentry to surface crash-driven churn.",
      body: "When a user's top driver is a crash, the real fix is shipping the patch — and the briefing can draft that stabilization ticket instead of an apology email. That only fires with error tracking connected.",
    };
  }

  // Errors but no analytics — analytics is the strongest predictor, get it next.
  if (!analytics && errors) {
    return {
      tone: "prompt",
      headline: "Connect analytics to ground the “why” in real usage.",
      body: "You've got billing plus crash signal, but without PostHog, Mixpanel, or Amplitude the usage-decline picture is missing — and that's the strongest churn predictor in the model.",
    };
  }

  // Everything connected — confirm the full picture, quietly.
  return {
    tone: "complete",
    headline: "All sources connected — the brain has the full picture.",
    body: "Billing, usage, and errors are joined per user. Every “why” below draws on all three.",
  };
}

/** For the zero-signal screen: which optional sources would deepen the read. */
export function missingSourceSuggestions(
  cats: Set<SourceCategory>,
): { label: string; detail: string }[] {
  const out: { label: string; detail: string }[] = [];
  if (!cats.has("analytics"))
    out.push({
      label: "Connect product analytics",
      detail: "PostHog · Mixpanel · Amplitude — surfaces usage decline before a cancel.",
    });
  if (!cats.has("errors"))
    out.push({
      label: "Connect error tracking",
      detail: "Sentry — flags crash-driven churn the billing data can't see.",
    });
  return out;
}
