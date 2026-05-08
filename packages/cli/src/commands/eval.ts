import kleur from "kleur";
import { runFullEval } from "@rcrb/eval";

function parsePositiveInt(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    console.error(kleur.red(`invalid --${name}: ${value} (expected positive integer)`));
    process.exit(2);
  }
  return n;
}

function parseFraction(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1) {
    console.error(kleur.red(`invalid --${name}: ${value} (expected number in [0, 1])`));
    process.exit(2);
  }
  return n;
}

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
    num_users: parsePositiveInt(opts.users, "users"),
    days: parsePositiveInt(opts.days, "days"),
    threshold: parseFraction(opts.threshold, "threshold"),
    withInterventions: !!opts.withInterventions,
    withLLMJudge: !!opts.withLlmJudge,
  });
  console.log(md);
}
