#!/usr/bin/env -S tsx

import { Command } from "commander";
import { runDemo } from "./commands/demo.js";
import { runEval } from "./commands/eval.js";
import { runInit } from "./commands/init.js";
import { runRun } from "./commands/run.js";
import { runWebhookListen } from "./commands/webhook-listen.js";
import { runEventsMcp } from "./commands/events-mcp.js";

const program = new Command();
program
  .name("retention-brain")
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

program
  .command("webhook-listen")
  .description("Start an HTTP webhook receiver for Stripe + RevenueCat; appends events to .retention-brain/events.jsonl")
  .option("--port <n>", "HTTP port", "4044")
  .option("--store <path>", "event log file", ".retention-brain/events.jsonl")
  .option("--insecure", "accept unsigned webhooks (sandbox testing only — do not use in production)")
  .action(runWebhookListen);

program
  .command("events-mcp-server")
  .description("Stdio MCP server that exposes captured webhook events as list_events(since, until). Intended to be launched as a child process from .retention-brain/mcp.json")
  .option("--store <path>", "event log file", ".retention-brain/events.jsonl")
  .action(runEventsMcp);

await program.parseAsync();
