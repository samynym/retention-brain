import { createClient } from "@supabase/supabase-js";

/**
 * Service-role Supabase client — server-side only. Bypasses RLS, so it must
 * never be exposed to the browser. Used to verify user tokens, read the
 * allowlist, and persist briefings.
 */
const url = process.env.SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceKey) {
  throw new Error(
    "SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set (see apps/server/.env).",
  );
}

export const admin = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
