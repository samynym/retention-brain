import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

export type MCPTransportConfig =
  | { kind: "stdio"; command: string; args?: string[]; env?: Record<string, string> }
  | { kind: "http"; url: string; headers?: Record<string, string> };

export type MCPCallResult = {
  text: string;
  parsed: unknown;
};

export type MCPClientHandle = {
  callTool(name: string, args?: Record<string, unknown>): Promise<MCPCallResult>;
  close(): Promise<void>;
};

export async function openMCPClient(
  label: string,
  transport: MCPTransportConfig
): Promise<MCPClientHandle> {
  const client = new Client({ name: `rcrb-${label}`, version: "0.0.1" });
  if (transport.kind === "stdio") {
    const stdio = new StdioClientTransport({
      command: transport.command,
      args: transport.args ?? [],
      env: { ...process.env, ...(transport.env ?? {}) } as Record<string, string>,
    });
    await client.connect(stdio);
  } else {
    const headers = transport.headers ?? {};
    const http = new StreamableHTTPClientTransport(new URL(transport.url), {
      requestInit: { headers },
    });
    await client.connect(http);
  }

  return {
    async callTool(name, args = {}) {
      const res = await client.callTool({ name, arguments: args });
      const text = extractText(res);
      const parsed = tryParse(text);
      return { text, parsed };
    },
    async close() {
      await client.close();
    },
  };
}

function extractText(res: unknown): string {
  if (!res || typeof res !== "object") return "";
  const content = (res as { content?: unknown }).content;
  if (!Array.isArray(content)) return "";
  return content
    .map((c) => (c && typeof c === "object" && "text" in c ? String((c as { text: unknown }).text ?? "") : ""))
    .join("\n");
}

function tryParse(text: string): unknown {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return text;
  }
}
