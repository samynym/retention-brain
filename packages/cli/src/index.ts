#!/usr/bin/env -S tsx

import { Command } from "commander";
import { runDemo } from "./commands/demo.js";
import { runEval } from "./commands/eval.js";
import { runInit } from "./commands/init.js";
import { runRun } from "./commands/run.js";

const program = new Command();
program
  .name("rc-retention-brain")
  .description("Per-user, cross-source retention agent for subscription apps (MCP-only)")
  .version("0.0.1");

program
  .command("init")
  .description("Interactive setup — prompts for env keys and writes .env")
  .action(runInit);

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
  .description("Pull events from configured MCP sources, score risk, and write a markdown briefing")
  .option("--as-of <iso>", "evaluation cutoff (ISO date); defaults to now")
  .option("--threshold <n>", "risk threshold for flagging", "0.4")
  .action(runRun);

await program.parseAsync();
