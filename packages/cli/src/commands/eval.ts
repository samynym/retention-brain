import { runFullEval } from "@rcrb/eval";

export async function runEval(opts: {
  seed: string;
  users: string;
  days: string;
  threshold: string;
  withInterventions?: boolean;
  withLlmJudge?: boolean;
}) {
  const md = await runFullEval({
    seed: opts.seed,
    num_users: parseInt(opts.users, 10),
    days: parseInt(opts.days, 10),
    threshold: parseFloat(opts.threshold),
    withInterventions: !!opts.withInterventions,
    withLLMJudge: !!opts.withLlmJudge,
  });
  console.log(md);
}
