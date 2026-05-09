import { describe, it, expect } from "vitest";
import { loadMCPSourcesFromEnv, loadMCPSourcesFromFile } from "./loader.js";
import { mkdtempSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

describe("loadMCPSourcesFromEnv", () => {
  it("returns [] when MCP_SOURCES is unset", () => {
    expect(loadMCPSourcesFromEnv({})).toEqual([]);
  });

  it("parses one stdio entry with config mapper", () => {
    const env = {
      MCP_SOURCES: "support",
      MCP_SUPPORT_COMMAND: "npx -y some-mcp",
      MCP_SUPPORT_TOOL: "list_conversations",
      MCP_SUPPORT_MAPPER: "config",
      MCP_SUPPORT_MAPPING: '{"user_id":"$.user.id","timestamp":"$.ts","kind":"$.kind"}',
    };
    const [entry] = loadMCPSourcesFromEnv(env);
    expect(entry?.label).toBe("support");
    expect(entry?.transport).toEqual({ kind: "stdio", command: "npx", args: ["-y", "some-mcp"], env: undefined });
    expect(entry?.tool).toBe("list_conversations");
    expect(entry?.mapper).toBe("config");
    expect(entry?.mapping?.user_id).toBe("$.user.id");
  });

  it("parses an http entry", () => {
    const env = {
      MCP_SOURCES: "crm",
      MCP_CRM_URL: "https://example.com/mcp",
      MCP_CRM_TOOL: "list_deals",
      MCP_CRM_HEADERS: '{"Authorization":"Bearer x"}',
    };
    const [entry] = loadMCPSourcesFromEnv(env);
    expect(entry?.transport).toEqual({
      kind: "http",
      url: "https://example.com/mcp",
      headers: { Authorization: "Bearer x" },
    });
  });

  it("normalizes labels with hyphens to uppercase env keys", () => {
    const env = {
      MCP_SOURCES: "my-tool",
      "MCP_MY_TOOL_COMMAND": "uvx some-mcp",
      "MCP_MY_TOOL_TOOL": "fetch",
    };
    const [entry] = loadMCPSourcesFromEnv(env);
    expect(entry?.label).toBe("my-tool");
    expect(entry?.tool).toBe("fetch");
  });

  it("throws when neither command nor url provided", () => {
    expect(() =>
      loadMCPSourcesFromEnv({
        MCP_SOURCES: "broken",
        MCP_BROKEN_TOOL: "anything",
      })
    ).toThrow(/COMMAND.*URL/);
  });

  it("supports multiple sources", () => {
    const env = {
      MCP_SOURCES: "a,b",
      MCP_A_COMMAND: "cmd-a",
      MCP_A_TOOL: "tool-a",
      MCP_B_URL: "https://b.example.com",
      MCP_B_TOOL: "tool-b",
    };
    const list = loadMCPSourcesFromEnv(env);
    expect(list.map((e) => e.label)).toEqual(["a", "b"]);
  });
});

describe("loadMCPSourcesFromFile", () => {
  it("returns [] when no file exists", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rcrb-mcp-"));
    expect(loadMCPSourcesFromFile(cwd)).toEqual([]);
  });

  it("reads .rcrb/mcp.json", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rcrb-mcp-"));
    mkdirSync(join(cwd, ".rcrb"));
    writeFileSync(
      join(cwd, ".rcrb/mcp.json"),
      JSON.stringify({
        sources: [
          {
            label: "support",
            command: "npx",
            args: ["-y", "some-mcp"],
            tool: "list_records",
            mapper: "llm",
            hint: "support tickets",
          },
        ],
      })
    );
    const [entry] = loadMCPSourcesFromFile(cwd);
    expect(entry?.label).toBe("support");
    expect(entry?.transport).toEqual({ kind: "stdio", command: "npx", args: ["-y", "some-mcp"], env: undefined });
    expect(entry?.mapper).toBe("llm");
    expect(entry?.hint).toBe("support tickets");
  });

  it("reads rcrb.config.json as fallback", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rcrb-mcp-"));
    writeFileSync(
      join(cwd, "rcrb.config.json"),
      JSON.stringify({
        sources: [{ label: "x", url: "https://x.com", tool: "fetch" }],
      })
    );
    const [entry] = loadMCPSourcesFromFile(cwd);
    expect(entry?.label).toBe("x");
    expect(entry?.transport).toEqual({ kind: "http", url: "https://x.com", headers: undefined });
  });

  it("throws on invalid schema", () => {
    const cwd = mkdtempSync(join(tmpdir(), "rcrb-mcp-"));
    writeFileSync(join(cwd, "rcrb.config.json"), JSON.stringify({ sources: [{ label: "x" }] }));
    expect(() => loadMCPSourcesFromFile(cwd)).toThrow();
  });
});
