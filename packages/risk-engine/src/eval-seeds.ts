// Seeds used during signal-weight tuning. Tests with these seeds may exist
// to support iteration; their numbers are NOT the official quality bars.
export const TRAIN_SEEDS = ["risk-test", "trend-test", "precision-test", "demo"] as const;

// Seeds used for held-out evaluation. Bars asserted on these seeds are the
// official quality bars. Weight tuning must not use these seeds for tuning;
// they are observed only after a tuning iteration completes.
export const EVAL_SEEDS = ["eval-fixed-1", "eval-fixed-2", "eval-fixed-3"] as const;

export type TrainSeed = typeof TRAIN_SEEDS[number];
export type EvalSeed = typeof EVAL_SEEDS[number];
