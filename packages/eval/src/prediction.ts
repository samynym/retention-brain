import type { GroundTruthLabel } from "@rcrb/sources/synthetic";
import type { RiskScore } from "@rcrb/risk-engine";

export type PredictionEval = {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  by_persona: Record<string, { count: number; avg_score: number; recall_at_threshold: number }>;
};

export function evalPredictions(
  scores: RiskScore[],
  gt: GroundTruthLabel[],
  threshold = 0.5
): PredictionEval {
  const scoreByUser = new Map(scores.map((s) => [s.user_id, s]));
  const churnerSet = new Set(gt.filter((g) => g.will_churn).map((g) => g.user_id));
  const flagged = scores.filter((s) => s.score >= threshold);
  const flaggedSet = new Set(flagged.map((s) => s.user_id));

  const tp = flagged.filter((s) => churnerSet.has(s.user_id)).length;
  const fp = flagged.length - tp;
  const fn = churnerSet.size - tp;

  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);

  const personaBuckets = new Map<string, GroundTruthLabel[]>();
  for (const g of gt) {
    let arr = personaBuckets.get(g.persona);
    if (!arr) {
      arr = [];
      personaBuckets.set(g.persona, arr);
    }
    arr.push(g);
  }

  const by_persona: PredictionEval["by_persona"] = {};
  for (const [persona, users] of personaBuckets) {
    let scoreSum = 0;
    let scoreN = 0;
    let churners = 0;
    let churnersFlagged = 0;
    for (const u of users) {
      const s = scoreByUser.get(u.user_id);
      if (s) {
        scoreSum += s.score;
        scoreN += 1;
      }
      if (u.will_churn) {
        churners += 1;
        if (flaggedSet.has(u.user_id)) churnersFlagged += 1;
      }
    }
    by_persona[persona] = {
      count: users.length,
      avg_score: scoreN > 0 ? scoreSum / scoreN : 0,
      recall_at_threshold: churners > 0 ? churnersFlagged / churners : 0,
    };
  }

  return { threshold, precision, recall, f1, by_persona };
}
