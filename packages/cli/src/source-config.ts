import type { Source } from "@retention-brain/sources";
import { loadMCPSources, mcpSource, type LoadedMCPSource } from "@retention-brain/sources-mcp";

export type EnabledSources = {
  mcp: string[];
};

export type SourceBundle = {
  sources: Source[];
  enabled: EnabledSources;
};

export class NoSubscriptionSourceError extends Error {
  constructor() {
    super(
      "no MCP source configured — add one to .retention-brain/mcp.json or set MCP_SOURCES + MCP_<LABEL>_* env vars"
    );
    this.name = "NoSubscriptionSourceError";
  }
}

export function loadSourcesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): SourceBundle {
  const sources: Source[] = [];
  const enabled: EnabledSources = { mcp: [] };

  const mcpEntries: LoadedMCPSource[] = loadMCPSources({ cwd, env });
  for (const entry of mcpEntries) {
    sources.push(mcpSource(entry));
    enabled.mcp.push(entry.label);
  }

  if (sources.length === 0) {
    throw new NoSubscriptionSourceError();
  }

  return { sources, enabled };
}
