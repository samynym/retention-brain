import type { Source } from "../source.js";
import { generate, type GenerateOpts } from "./generate.js";
import type { GroundTruthLabel } from "./ground-truth.js";

export type SyntheticSource = Source & {
  ground_truth: GroundTruthLabel[];
};

export function syntheticSource(opts: GenerateOpts): SyntheticSource {
  const { events, ground_truth } = generate(opts);
  return {
    name: "synthetic",
    ground_truth,
    async *backfill({ since, until }) {
      const sinceIso = since.toISOString();
      const untilIso = until.toISOString();
      for (const e of events) {
        if (e.timestamp >= sinceIso && e.timestamp < untilIso) yield e;
      }
    },
  };
}

export { generate } from "./generate.js";
export type { GenerateOpts, GenerateResult } from "./generate.js";
export type { GroundTruthLabel } from "./ground-truth.js";
export { personas } from "./personas/index.js";
