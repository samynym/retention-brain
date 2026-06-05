import { randomBytes } from "node:crypto";
import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient,
  startAuthorization,
} from "@modelcontextprotocol/sdk/client/auth.js";
import type {
  OAuthClientInformationFull,
  OAuthTokens,
} from "@modelcontextprotocol/sdk/shared/auth.js";
import { mcpSource } from "@retention-brain/sources-mcp";
import { CONNECTORS, type ConnectorKind } from "./connectors.js";
import type { EventSource } from "./sources/types.js";
import { admin } from "./supabase.js";
import { getSourceSecret, saveSource } from "./store.js";

/**
 * Hosted OAuth bridge for the MCP connectors. Each provider's remote MCP server
 * does OAuth + dynamic client registration, so the flow is:
 *   start  → discover + DCR + PKCE → return the provider's authorize URL
 *   (user authorizes in the browser; provider redirects to our callback)
 *   finish → exchange the code for tokens → store them encrypted per user
 * The stored tokens then feed `mcpSource` to pull + normalize that provider's
 * events at analyze time.
 */

type StoredOAuth = {
  tokens: OAuthTokens;
  obtained_at: number; // ms epoch
  auth_server_url: string;
  client_info: OAuthClientInformationFull;
  resource: string; // the MCP url
};

/** Begin a connect flow; returns the provider's authorization URL to redirect to. */
export async function startConnect(
  userId: string,
  kind: ConnectorKind,
  redirectUri: string,
  returnTo: string,
): Promise<string> {
  const c = CONNECTORS[kind];
  const prm = await discoverOAuthProtectedResourceMetadata(c.mcpUrl);
  const authServerUrl = prm.authorization_servers?.[0];
  if (!authServerUrl) throw new Error(`${c.name}: no authorization server advertised.`);
  const metadata = await discoverAuthorizationServerMetadata(authServerUrl);
  if (!metadata) throw new Error(`${c.name}: no authorization-server metadata.`);

  // Prefer the connector's explicit least-privilege scopes; otherwise fall back
  // to every read-only scope the server advertises (never write/admin/delete).
  const supported = metadata.scopes_supported ?? [];
  const readScopes = supported.filter(
    (s) => /read|view/i.test(s) && !/write|admin|delete|manage/i.test(s),
  );
  const scope = c.scopes?.length
    ? c.scopes.join(" ")
    : (readScopes.length ? readScopes : supported).join(" ") || undefined;
  const clientInfo = await registerClient(authServerUrl, {
    metadata,
    clientMetadata: {
      client_name: "retention-brain",
      redirect_uris: [redirectUri],
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "client_secret_post",
      scope,
    },
  });

  const state = randomBytes(24).toString("base64url");
  const { authorizationUrl, codeVerifier } = await startAuthorization(authServerUrl, {
    metadata,
    clientInformation: clientInfo,
    redirectUrl: redirectUri,
    scope,
    state,
    resource: new URL(c.mcpUrl),
  });

  const { error } = await admin.from("oauth_flows").insert({
    state,
    user_id: userId,
    provider: kind,
    code_verifier: codeVerifier,
    auth_server_url: authServerUrl,
    client_info: clientInfo,
    resource: c.mcpUrl,
    return_to: returnTo,
  });
  if (error) throw new Error(`Couldn't start the flow: ${error.message}`);

  return authorizationUrl.toString();
}

/** Complete a connect flow from the provider's redirect; stores the tokens. */
export async function completeConnect(
  state: string,
  code: string,
  redirectUri: string,
): Promise<{ userId: string; kind: ConnectorKind; returnTo: string }> {
  const { data: flow, error } = await admin
    .from("oauth_flows")
    .select("*")
    .eq("state", state)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!flow) throw new Error("Unknown or expired OAuth state.");

  const metadata = await discoverAuthorizationServerMetadata(flow.auth_server_url);
  const tokens = await exchangeAuthorization(flow.auth_server_url, {
    metadata: metadata ?? undefined,
    clientInformation: flow.client_info as OAuthClientInformationFull,
    authorizationCode: code,
    codeVerifier: flow.code_verifier,
    redirectUri,
    resource: new URL(flow.resource),
  });

  const stored: StoredOAuth = {
    tokens,
    obtained_at: Date.now(),
    auth_server_url: flow.auth_server_url,
    client_info: flow.client_info as OAuthClientInformationFull,
    resource: flow.resource,
  };
  const kind = flow.provider as ConnectorKind;
  await saveSource(flow.user_id, kind, CONNECTORS[kind].name, JSON.stringify(stored));
  await admin.from("oauth_flows").delete().eq("state", state);

  return {
    userId: flow.user_id,
    kind,
    returnTo: (flow.return_to as string | null) ?? "http://localhost:5180",
  };
}

/** Build an event source for a connected OAuth provider, refreshing if needed. */
export async function oauthSource(
  userId: string,
  kind: ConnectorKind,
): Promise<EventSource | null> {
  const rec = await getSourceSecret(userId, kind);
  if (!rec) return null;
  const stored = JSON.parse(rec.secret) as StoredOAuth;
  let tokens = stored.tokens;

  const expMs = stored.obtained_at + (tokens.expires_in ?? 3600) * 1000;
  if (Date.now() > expMs - 60_000 && tokens.refresh_token) {
    const metadata = await discoverAuthorizationServerMetadata(stored.auth_server_url);
    tokens = await refreshAuthorization(stored.auth_server_url, {
      metadata: metadata ?? undefined,
      clientInformation: stored.client_info,
      refreshToken: tokens.refresh_token,
    });
    stored.tokens = tokens;
    stored.obtained_at = Date.now();
    await saveSource(userId, kind, CONNECTORS[kind].name, JSON.stringify(stored));
  }

  const c = CONNECTORS[kind];
  return mcpSource({
    label: kind,
    transport: {
      kind: "http",
      url: c.mcpUrl,
      headers: { Authorization: `Bearer ${tokens.access_token}` },
    },
    tool: c.tool,
    args: c.toolArgs,
    mapper: "llm",
    hint: c.hint,
  }) as EventSource;
}
