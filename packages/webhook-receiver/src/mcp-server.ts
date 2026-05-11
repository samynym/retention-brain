import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { EventStore } from "./storage.js";

export type LocalEventsMCPOptions = {
  storePath: string;
};

export async function startLocalEventsMCP(opts: LocalEventsMCPOptions): Promise<void> {
  const store = new EventStore(opts.storePath);
  const server = new McpServer({ name: "rcrb-events", version: "0.0.1" });

  server.registerTool(
    "list_events",
    {
      description:
        "Return events captured from RC + Stripe webhooks, optionally filtered by ISO-8601 date range.",
      inputSchema: {
        since: z.string().optional().describe("ISO-8601 lower bound (inclusive)"),
        until: z.string().optional().describe("ISO-8601 upper bound (inclusive)"),
      },
    },
    async ({ since, until }) => {
      const events = await store.readAll({
        ...(since && { since: new Date(since) }),
        ...(until && { until: new Date(until) }),
      });
      return {
        content: [{ type: "text", text: JSON.stringify(events) }],
      };
    }
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}
