import type { Channel, OfferKind, Timing } from "../types/intervention";

/**
 * Human-readable renderings of the core enum types. Kept in one place so the
 * briefing UI speaks the same language the CLI briefing does (PRODUCT.md).
 */

export function channelLabel(c: Channel): string {
  switch (c) {
    case "email":
      return "Email";
    case "push":
      return "Push";
    case "in_app":
      return "In-app";
    case "dunning_fix":
      return "Dunning fix";
    case "no_op":
      return "No action";
  }
}

export function offerLabel(kind: OfferKind, value?: number): string {
  switch (kind) {
    case "discount_percent":
      return `${value ?? 0}% off`;
    case "discount_amount":
      return `$${value ?? 0} off`;
    case "extension_days":
      return `${value ?? 0}-day extension`;
    case "upgrade_incentive":
      return "Upgrade incentive";
    case "feature_unlock":
      return "Feature unlock";
    case "none":
      return "No offer";
  }
}

export function timingLabel(t: Timing): string {
  switch (t) {
    case "immediate":
      return "Immediately";
    case "next_session":
      return "Next session";
    case "within_24h":
      return "Within 24h";
    case "before_renewal":
      return "Before renewal";
  }
}

/** Turns a snake_case signal name into a Title Case label. */
export function signalLabel(name: string): string {
  return name
    .split("_")
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

export type RiskBand = "high" | "medium" | "low";

/** Risk bands mirror the CLI thresholds in PRODUCT.md (>0.7 high, 0.5–0.7 med). */
export function riskBand(score: number): RiskBand {
  if (score >= 0.7) return "high";
  if (score >= 0.5) return "medium";
  return "low";
}

export function riskBandLabel(band: RiskBand): string {
  return band === "high"
    ? "High risk"
    : band === "medium"
      ? "Medium risk"
      : "Low risk";
}

/** Score 0–1 rendered as a two-decimal figure, the way the briefing reads it. */
export function riskFigure(score: number): string {
  return score.toFixed(2);
}

/** "2026-05-28T00:00:00.000Z" -> "May 28" */
export function shortDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

/** "2026-06-01T14:30:00.000Z" -> "Jun 1 · 14:30" for the evidence timeline */
export function eventStamp(iso: string): string {
  const d = new Date(iso);
  const date = d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
  const time = d.toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
  return `${date} · ${time}`;
}
