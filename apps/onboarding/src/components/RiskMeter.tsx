import { riskBand, riskBandLabel, riskFigure, type RiskBand } from "../lib/format";

const BAND_COLOR: Record<RiskBand, string> = {
  high: "var(--color-risk-high)",
  medium: "var(--color-risk-med)",
  low: "var(--color-risk-low)",
};

/** The headline risk figure for a user card — big tabular number + a band. */
export function RiskFigure({ score }: { score: number }) {
  const band = riskBand(score);
  const color = BAND_COLOR[band];
  return (
    <div className="flex flex-col items-end gap-1">
      <span
        className="tnum font-display text-[40px] leading-none font-medium"
        style={{ color }}
      >
        {riskFigure(score)}
      </span>
      <span
        className="font-mono text-[10px] tracking-[0.14em] uppercase"
        style={{ color }}
      >
        {riskBandLabel(band)}
      </span>
    </div>
  );
}

/**
 * A horizontal contribution meter for a single signal: score×weight rendered
 * as a fill, the way the risk engine sorts top_signals.
 */
export function ContributionBar({
  score,
  weight,
  delayMs = 0,
}: {
  score: number;
  weight: number;
  delayMs?: number;
}) {
  // Normalize against the strongest possible single contribution (~0.4*1).
  const contribution = Math.min(1, (score * weight) / 0.4);
  return (
    <div
      className="h-[3px] w-full overflow-hidden rounded-full"
      style={{ backgroundColor: "var(--color-sunk)" }}
    >
      <div
        className="meter-fill h-full rounded-full"
        style={{
          width: `${Math.max(4, contribution * 100)}%`,
          backgroundColor: "var(--color-accent)",
          opacity: 0.55,
          animationDelay: `${delayMs}ms`,
        }}
      />
    </div>
  );
}
