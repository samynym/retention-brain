import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { admin } from "./supabase.js";

/**
 * Verifies the auth gate end-to-end without an email round-trip: mints a real
 * session for an email via the admin generate-link + verify-otp flow, then hits
 * the backend as that user. Run: pnpm --filter @retention-brain/server exec tsx src/dev-auth-test.ts
 */

const BASE = `http://localhost:${process.env.PORT ?? 8787}`;
const anonClient = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

async function sessionFor(email: string): Promise<string> {
  // ensure the user exists (idempotent)
  await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
  const { data, error } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email,
  });
  if (error || !data.properties?.hashed_token) {
    throw new Error(`generateLink failed: ${error?.message}`);
  }
  const { data: v, error: vErr } = await anonClient.auth.verifyOtp({
    type: "magiclink",
    token_hash: data.properties.hashed_token,
  });
  if (vErr || !v.session?.access_token) {
    throw new Error(`verifyOtp failed: ${vErr?.message}`);
  }
  return v.session.access_token;
}

async function call(path: string, token: string, method = "GET") {
  const res = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      "content-type": "application/json",
    },
    body: method === "POST" ? JSON.stringify({ cheap: true, maxInterventions: 0 }) : undefined,
  });
  const body = await res.json().catch(() => ({}));
  return { status: res.status, body };
}

async function main() {
  console.log("=== allowlisted owner ===");
  const ownerToken = await sessionFor("samynaayma@gmail.com");
  console.log("/api/me      ", await call("/api/me", ownerToken));
  console.log("/api/analyze ", await call("/api/analyze", ownerToken, "POST"));

  console.log("\n=== non-allowlisted user ===");
  const strangerToken = await sessionFor("stranger@example.com");
  console.log("/api/me      ", await call("/api/me", strangerToken));
  console.log("/api/analyze ", await call("/api/analyze", strangerToken, "POST"));

  // cleanup the test stranger
  const { data } = await admin.auth.admin.listUsers();
  const stranger = data.users.find((u) => u.email === "stranger@example.com");
  if (stranger) await admin.auth.admin.deleteUser(stranger.id);
  console.log("\ncleaned up test stranger user.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
