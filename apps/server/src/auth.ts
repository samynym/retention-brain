import type { Context, Next } from "hono";
import { admin } from "./supabase.js";

export type AuthUser = { id: string; email: string };

export type Env = { Variables: { user: AuthUser } };

/**
 * Verifies the bearer token against Supabase Auth and attaches the user to the
 * context. 401 if there's no valid session. Registration is open, so every
 * valid Supabase user can use the hosted app.
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

  c.set("user", { id: data.user.id, email });
  await next();
}

