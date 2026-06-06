import type { RiskScore } from "@retention-brain/risk-engine";

export function formatTopSignals(
  risk: RiskScore,
  opts: { withScore?: boolean } = {}
): string {
  return risk.top_signals
    .map((s) => {
      const head = opts.withScore
        ? `- ${s.name} (score=${s.score.toFixed(2)}):`
        : `- ${s.name}:`;
      return `${head} ${s.reason}`;
    })
    .join("\n");
}
