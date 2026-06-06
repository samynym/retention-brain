/**
 * OAuth-capable MCP connectors. Each remote MCP server handles its own OAuth
 * (dynamic client registration + PKCE), so connecting is a click → authorize →
 * token flow — no API keys, no app registration. Tool + args + hint come from
 * examples/mcp.json (grounded in vendor docs). The token plugs straight into
 * `mcpSource` from @retention-brain/sources-mcp, which calls the tool and
 * LLM-normalizes the rows into the engine's Events.
 */
export type ConnectorKind = "sentry" | "posthog";

export type Connector = {
  kind: ConnectorKind;
  name: string;
  /** which frontend source slot this satisfies (errors / analytics) */
  category: "errors" | "analytics";
  mcpUrl: string;
  tool: string;
  toolArgs: Record<string, unknown>;
  hint: string;
  /**
   * Explicit OAuth scopes to request (least-privilege). When set, overrides the
   * "all read scopes the server advertises" default — avoids a consent wall.
   * If the MCP complains a scope is missing, add it here.
   */
  scopes?: string[];
};

export const CONNECTORS: Record<ConnectorKind, Connector> = {
  sentry: {
    kind: "sentry",
    name: "Sentry",
    category: "errors",
    mcpUrl: "https://mcp.sentry.dev/mcp",
    tool: "search_events",
    toolArgs: {
      dataset: "errors",
      query: "level:[error,fatal] has:user.id",
      statsPeriod: "60d",
      limit: 1000,
    },
    hint: "Sentry events. user_id from user.id (fall back to user.email or user.username). timestamp is ISO. Map level='fatal' OR exception.values[].mechanism.handled=false to error.crash; level='error' to error.client. Skip events without a user identifier.",
  },
  posthog: {
    kind: "posthog",
    name: "PostHog",
    category: "analytics",
    mcpUrl: "https://mcp.posthog.com/mcp",
    tool: "execute-sql",
    toolArgs: {
      query:
        "SELECT distinct_id, properties.app_user_id AS app_user_id, event, timestamp, properties FROM events WHERE event IN ('$session_start', '$pageview') AND timestamp >= now() - INTERVAL 60 DAY ORDER BY timestamp DESC LIMIT 10000",
    },
    hint: "PostHog HogQL rows. user_id should be properties.app_user_id when present, else distinct_id. timestamp is ISO. Map event='$session_start' to usage.session, '$pageview' or any custom name to usage.feature. Skip $identify/$set rows.",
    // Minimal set for an event HogQL query (vs the ~90 read scopes PostHog
    // advertises). `user:read` is mandatory: the MCP's own `initialize`
    // handshake calls GET /api/users/@me/ to resolve the active project, so
    // without it every tool call 4xxs before our query ever runs.
    scopes: [
      "query:read",
      "user:read",
      "insight:read",
      "event_definition:read",
      "person:read",
      "project:read",
      "organization:read",
    ],
  },
};

export function isConnectorKind(s: string): s is ConnectorKind {
  return s === "sentry" || s === "posthog";
}
