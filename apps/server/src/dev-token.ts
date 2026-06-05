import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { admin } from "./supabase.js";

/** Mint a real session (access+refresh) for an email — for local UI testing. */
const email = process.argv[2] ?? "samynaayma@gmail.com";
const anon = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_ANON_KEY!,
  { auth: { persistSession: false } },
);

await admin.auth.admin.createUser({ email, email_confirm: true }).catch(() => {});
const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
if (error || !data.properties?.hashed_token) throw new Error(`generateLink: ${error?.message}`);
const { data: v, error: vErr } = await anon.auth.verifyOtp({
  type: "magiclink",
  token_hash: data.properties.hashed_token,
});
if (vErr || !v.session) throw new Error(`verifyOtp: ${vErr?.message}`);
console.log("ACCESS=" + v.session.access_token);
console.log("REFRESH=" + v.session.refresh_token);
