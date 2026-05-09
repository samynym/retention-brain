import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";
import type { MCPSourceConfig } from "./source.js";
import type { MCPTransportConfig } from "./client.js";
import type { FieldMapping } from "./normalize-config.js";

const MappingSchema = z.object({
  user_id: z.string(),
  timestamp: z.string(),
  kind: z.string(),
  id: z.string().optional(),
  payload: z.string().optional(),
});

const EntrySchema = z
  .object({
    label: z.string().min(1),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    env: z.record(z.string()).optional(),
    url: z.string().url().optional(),
    headers: z.record(z.string()).optional(),
    tool: z.string().min(1),
    toolArgs: z.record(z.unknown()).optional(),
    mapper: z.enum(["config", "llm"]).optional(),
    mapping: MappingSchema.optional(),
    hint: z.string().optional(),
    passDateRange: z.boolean().optional(),
  })
  .refine((e) => !!e.command || !!e.url, {
    message: "MCP entry needs either `command` (stdio) or `url` (http)",
  });

const FileSchema = z.object({
  sources: z.array(EntrySchema),
});

export type LoadedMCPSource = MCPSourceConfig;

const DEFAULT_JSON_PATHS = [".rcrb/mcp.json", "rcrb.config.json"];

export function loadMCPSourcesFromFile(cwd: string = process.cwd()): LoadedMCPSource[] {
  for (const rel of DEFAULT_JSON_PATHS) {
    const path = resolve(cwd, rel);
    if (!existsSync(path)) continue;
    const raw = readFileSync(path, "utf8");
    const parsed = FileSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(`${rel}: ${parsed.error.issues.map((i) => `${i.path.join(".")} — ${i.message}`).join("; ")}`);
    }
    return parsed.data.sources.map(toSourceConfig);
  }
  return [];
}

export function loadMCPSourcesFromEnv(env: NodeJS.ProcessEnv = process.env): LoadedMCPSource[] {
  const list = (env.MCP_SOURCES ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (list.length === 0) return [];
  return list.map((label) => entryFromEnv(label, env)).map(toSourceConfig);
}

export function loadMCPSources(opts: { cwd?: string; env?: NodeJS.ProcessEnv } = {}): LoadedMCPSource[] {
  const fromFile = loadMCPSourcesFromFile(opts.cwd);
  if (fromFile.length > 0) return fromFile;
  return loadMCPSourcesFromEnv(opts.env);
}

type EntryInput = z.infer<typeof EntrySchema>;

function entryFromEnv(label: string, env: NodeJS.ProcessEnv): EntryInput {
  const upper = label.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  const get = (k: string) => env[`MCP_${upper}_${k}`];

  const commandLine = get("COMMAND");
  const url = get("URL");
  if (!commandLine && !url) {
    throw new Error(`MCP[${label}]: set MCP_${upper}_COMMAND (stdio) or MCP_${upper}_URL (http)`);
  }
  const tool = get("TOOL");
  if (!tool) throw new Error(`MCP[${label}]: MCP_${upper}_TOOL is required`);

  const toolArgsRaw = get("ARGS");
  const mappingRaw = get("MAPPING");
  const headersRaw = get("HEADERS");
  const envRaw = get("ENV");

  let command: string | undefined;
  let args: string[] | undefined;
  if (commandLine) {
    const parts = parseCommand(commandLine);
    command = parts[0];
    args = parts.slice(1);
  }

  const mapper = (get("MAPPER")?.toLowerCase() as "config" | "llm" | undefined) ?? undefined;
  const passDateRange = get("PASS_DATE_RANGE")?.toLowerCase() === "true";
  const hint = get("HINT");

  const entry = {
    label,
    command,
    args,
    env: envRaw ? safeJSON<Record<string, string>>(envRaw, `MCP_${upper}_ENV`) : undefined,
    url,
    headers: headersRaw ? safeJSON<Record<string, string>>(headersRaw, `MCP_${upper}_HEADERS`) : undefined,
    tool,
    toolArgs: toolArgsRaw ? safeJSON<Record<string, unknown>>(toolArgsRaw, `MCP_${upper}_ARGS`) : undefined,
    mapper,
    mapping: mappingRaw ? safeJSON<FieldMapping>(mappingRaw, `MCP_${upper}_MAPPING`) : undefined,
    hint,
    passDateRange,
  };
  const parsed = EntrySchema.safeParse(entry);
  if (!parsed.success) {
    throw new Error(`MCP[${label}]: ${parsed.error.issues.map((i) => `${i.path.join(".")} — ${i.message}`).join("; ")}`);
  }
  return parsed.data;
}

function toSourceConfig(entry: EntryInput): MCPSourceConfig {
  const transport: MCPTransportConfig = entry.command
    ? { kind: "stdio", command: entry.command, args: entry.args, env: entry.env }
    : { kind: "http", url: entry.url!, headers: entry.headers };

  const cfg: MCPSourceConfig = {
    label: entry.label,
    transport,
    tool: entry.tool,
  };
  if (entry.toolArgs) cfg.args = entry.toolArgs;
  if (entry.mapper) cfg.mapper = entry.mapper;
  if (entry.mapping) cfg.mapping = entry.mapping;
  if (entry.hint) cfg.hint = entry.hint;
  if (entry.passDateRange) cfg.passDateRange = entry.passDateRange;
  return cfg;
}

function safeJSON<T>(s: string, name: string): T {
  try {
    return JSON.parse(s) as T;
  } catch (err) {
    throw new Error(`${name}: invalid JSON (${err instanceof Error ? err.message : String(err)})`);
  }
}

// minimal POSIX-style command tokenizer (handles single/double quotes; no shell expansion)
function parseCommand(line: string): string[] {
  const out: string[] = [];
  let buf = "";
  let quote: '"' | "'" | null = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!;
    if (quote) {
      if (c === quote) quote = null;
      else buf += c;
    } else if (c === '"' || c === "'") {
      quote = c;
    } else if (c === " " || c === "\t") {
      if (buf) {
        out.push(buf);
        buf = "";
      }
    } else {
      buf += c;
    }
  }
  if (buf) out.push(buf);
  return out;
}
