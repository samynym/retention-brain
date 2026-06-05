import { createClient } from "@supabase/supabase-js";

/**
 * Browser Supabase client (anon key — client-safe by design). Used only for
 * auth: magic-link sign-in and session. App data goes through the backend API.
 */
const url = import.meta.env.VITE_SUPABASE_URL;
const anon = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!url || !anon) {
  throw new Error(
    "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY must be set (see apps/onboarding/.env).",
  );
}

export const supabase = createClient(url, anon, {
  auth: { detectSessionInUrl: true, persistSession: true, autoRefreshToken: true },
});

// Dev-only: expose the client so the signed-in flow can be exercised in tests.
if (import.meta.env.DEV) {
  (window as unknown as { supabase: typeof supabase }).supabase = supabase;
}

