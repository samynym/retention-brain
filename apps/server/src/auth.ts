import type { Context, Next } from "hono";
import { admin } from "./supabase.js";

export type AuthUser = { id: string; email: string; allowlisted: boolean };

export type Env = { Variables: { user: AuthUser } };

/**
 * Verifies the bearer token against Supabase Auth and attaches the user (with
 * an allowlist flag) to the context. 401 if there's no valid session. Does NOT
 * reject non-allowlisted users — that's `guardAllowlisted`, so `/api/me` can
 * tell a signed-in-but-not-invited dev they're not on the list.
 */
export async function authMiddleware(c: Context<Env>, next: Next) {
  // The OAuth callback is hit by the provider's browser redirect (no bearer
  // token); it authenticates via the `state` param, so it must skip this gate.
  if (c.req.path === "/api/oauth/callback") return next();

  const header = c.req.header("Authorization") ?? "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) return c.json({ error: "Not signed in." }, 401);

  const { data, error } = await admin.auth.getUser(token);
  if (error || !data.user?.email) {
    return c.json({ error: "Invalid or expired session." }, 401);
  }
  const email = data.user.email.toLowerCase();

  const { data: allow } = await admin
    .from("allowlist")
    .select("email")
    .eq("email", email)
    .maybeSingle();

  c.set("user", { id: data.user.id, email, allowlisted: allow !== null });
  await next();
}

/** Rejects signed-in users who aren't on the beta allowlist. */
export async function guardAllowlisted(c: Context<Env>, next: Next) {
  const user = c.get("user");
  if (!user?.allowlisted) {
    return c.json({ error: "This email isn't on the beta allowlist yet." }, 403);
  }
  await next();
}
