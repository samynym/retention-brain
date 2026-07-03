import { anthropic } from "@ai-sdk/anthropic";
import { openai } from "@ai-sdk/openai";
import type { LanguageModel } from "ai";

export type LlmProvider = "anthropic" | "openai";

/**
 * Role hints what kind of generation a call site is doing, so the resolver can
 * pick a model whose strengths match the workload:
 * - "creative":   loose-schema text generation (e.g. email body) — favors fluency
 * - "structured": strict enum/JSON outputs — favors schema adherence
 * - "critic":     evaluator/judge — break self-judging loop with a different model
 */
export type ModelRole = "creative" | "structured" | "critic";

const DEFAULTS: Record<LlmProvider, Record<ModelRole, string>> = {
  anthropic: {
    creative: "claude-sonnet-4-6",
    structured: "claude-sonnet-4-6",
    critic: "claude-opus-4-7",
  },
  openai: {
    // gpt-5 drifts on strict JSON schemas in current AI-SDK structured-output mode;
    // gpt-4o is more reliable for enum/nested outputs. Keep gpt-5 for prose.
    creative: "gpt-5",
    structured: "gpt-4o",
    critic: "gpt-4o",
  },
};

export function getProvider(): LlmProvider {
  const explicit = process.env.LLM_PROVIDER?.toLowerCase();
  if (explicit === "anthropic" || explicit === "openai") return explicit;
  if (process.env.ANTHROPIC_API_KEY) return "anthropic";
  if (process.env.OPENAI_API_KEY) return "openai";
  return "anthropic";
}

export function getModelId(role: ModelRole = "structured"): string {
  if (role === "critic" && process.env.LLM_CRITIC_MODEL) return process.env.LLM_CRITIC_MODEL;
  if (role !== "critic" && process.env.LLM_MODEL) return process.env.LLM_MODEL;
  return DEFAULTS[getProvider()][role];
}

export function getModel(role: ModelRole | string = "structured"): LanguageModel {
  // Back-compat: if a model id string is passed (e.g. "claude-opus-4-7"), use it directly.
  const isRole = role === "creative" || role === "structured" || role === "critic";
  const id = isRole ? getModelId(role as ModelRole) : (role as string);
  return getProvider() === "openai" ? openai(id) : anthropic(id);
}

export function hasLLMKey(): boolean {
  return !!(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY);
}
