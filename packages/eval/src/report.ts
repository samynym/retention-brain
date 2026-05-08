import type { PredictionEval } from "./prediction.js";
import type { InterventionEval } from "./intervention.js";

export function renderReport(opts: {
  seed: string;
  num_users: number;
  days: number;
  prediction: PredictionEval;
  intervention?: InterventionEval;
}): string {
  const { seed, num_users, days, prediction, intervention } = opts;
  const lines: string[] = [];
  lines.push(`# Eval Report — seed=${seed}, ${num_users} users, ${days}d`);
  lines.push("");
  lines.push("## Prediction");
  lines.push(`- threshold: ${prediction.threshold}`);
  lines.push(`- precision: ${prediction.precision.toFixed(3)}`);
  lines.push(`- recall: ${prediction.recall.toFixed(3)}`);
  lines.push(`- F1: ${prediction.f1.toFixed(3)}`);
  lines.push("");
  lines.push("### By persona");
  lines.push("| persona | count | avg score | recall@thr |");
  lines.push("|---|---|---|---|");
  const personas = Object.keys(prediction.by_persona).sort();
  for (const p of personas) {
    const b = prediction.by_persona[p]!;
    lines.push(`| ${p} | ${b.count} | ${b.avg_score.toFixed(3)} | ${b.recall_at_threshold.toFixed(3)} |`);
  }

  if (intervention) {
    lines.push("");
    lines.push("## Intervention");
    lines.push(`- count: ${intervention.count}`);
    lines.push(`- relevance: ${intervention.avg.relevance.toFixed(2)}`);
    lines.push(`- personalization: ${intervention.avg.personalization.toFixed(2)}`);
    lines.push(`- tone: ${intervention.avg.tone.toFixed(2)}`);
    lines.push(`- plausibility: ${intervention.avg.plausibility.toFixed(2)}`);
    lines.push(`- aggregate: ${intervention.avg.aggregate.toFixed(2)}`);
    lines.push(`- accept_rate: ${(intervention.accept_rate * 100).toFixed(1)}%`);
  }

  return lines.join("\n") + "\n";
}
