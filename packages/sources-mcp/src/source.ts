import type { Source } from "@retention-brain/sources";
import { openMCPClient, type MCPTransportConfig } from "./client.js";
import { normalizeWithConfig, type FieldMapping } from "./normalize-config.js";
import { normalizeWithLLM } from "./normalize-llm.js";

export type MCPSourceConfig = {
  /** User-chosen label, e.g. "support", "crm", "analytics". Must be unique within a run. */
  label: string;
  /** stdio command or HTTP URL transport. */
  transport: MCPTransportConfig;
  /** Name of the MCP tool to invoke for backfill. */
  tool: string;
  /** Optional static args passed to the tool on every call. */
  args?: Record<string, unknown>;
  /**
   * Mapping mode:
   * - "config": deterministic field-path mapper. Requires `mapping`.
   * - "llm" (default when mapping is absent): the model converts raw output to events.
   */
  mapper?: "config" | "llm";
  /** Required when mapper === "config". */
  mapping?: FieldMapping;
  /** Free-text description of the source, passed to the LLM mapper as a hint. */
  hint?: string;
  /**
   * If true, pass `since`/`until` ISO strings into the tool args under the keys
   * `since` / `until`. Most MCPs that support time ranges accept these. Off by default.
   */
  passDateRange?: boolean;
};

export function mcpSource(config: MCPSourceConfig): Source {
  const mapper = config.mapper ?? (config.mapping ? "config" : "llm");
  if (mapper === "config" && !config.mapping) {
    throw new Error(
      `mcpSource[${config.label}]: mapper="config" requires a mapping (user_id, timestamp, kind paths)`
    );
  }

  return {
    name: `mcp:${config.label}`,
    async *backfill({ since, until }) {
      const client = await openMCPClient(config.label, config.transport);
      try {
        const args: Record<string, unknown> = { ...(config.args ?? {}) };
        if (config.passDateRange) {
          args.since = since.toISOString();
          args.until = until.toISOString();
        }
        const result = await client.callTool(config.tool, args);
        const raw = result.parsed ?? result.text;

        const events =
          mapper === "config"
            ? normalizeWithConfig(raw, {
                label: config.label,
                mapping: config.mapping!,
                since,
                until,
              })
            : await normalizeWithLLM(raw, {
                label: config.label,
                hint: config.hint,
                since,
                until,
              });

        for (const ev of events) yield ev;
      } finally {
        await client.close().catch(() => {});
      }
    },
  };
}
