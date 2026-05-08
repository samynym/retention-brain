#!/usr/bin/env -S tsx

import { Command } from "commander";
import { runDemo } from "./commands/demo.js";
import { runEval } from "./commands/eval.js";
import { runRun } from "./commands/run.js";
import { runSeedSandbox, SEED_SANDBOX_DEFAULTS } from "./commands/seed-sandbox.js";
import { runRevealFuture } from "./commands/reveal-future.js";

const program = new Command();
program
  .name("rc-retention-brain")
  .description("Per-user, cross-source retention agent for subscription apps")
  .version("0.0.1");

program
  .command("demo")
  .description("Run synthetic-data demo end-to-end")
  .option("--users <n>", "user count", "100")
  .option("--days <n>", "days", "30")
  .option("--seed <s>", "seed", "demo")
  .action(runDemo);

program
  .command("eval")
  .description("Run eval suite and print markdown report")
  .option("--seed <s>", "seed", "eval-default")
  .option("--users <n>", "user count", "500")
  .option("--days <n>", "days", "30")
  .option("--threshold <n>", "risk threshold", "0.4")
  .option("--with-interventions", "include intervention eval (slower, requires API key)")
  .option("--with-llm-judge", "use LLM judge in risk scoring (requires API key)")
  .action(runEval);

program
  .command("run")
  .description("Pull events from configured sources, score risk, and write a markdown briefing")
  .option("--as-of <iso>", "evaluation cutoff (ISO date); defaults to now")
  .option("--threshold <n>", "risk threshold for flagging", "0.4")
  .action(runRun);

program
  .command("seed-sandbox")
  .description("Populate configured sandboxes with realistic users; stage eval window locally")
  .option("--train-days <n>", "days pushed to sandboxes", SEED_SANDBOX_DEFAULTS.trainDays)
  .option("--eval-days <n>", "days staged locally for reveal-future", SEED_SANDBOX_DEFAULTS.evalDays)
  .option("--users <n>", "number of synthetic users", SEED_SANDBOX_DEFAULTS.users)
  .option("--seed <s>", "synthetic generator seed", SEED_SANDBOX_DEFAULTS.seed)
  .option("--no-reset", "skip idempotent cleanup of prior seed_* customers")
  .action(runSeedSandbox);

program
  .command("reveal-future")
  .description("Push staged eval-window events to sandboxes and compute actual-vs-predicted")
  .action(runRevealFuture);

await program.parseAsync();
