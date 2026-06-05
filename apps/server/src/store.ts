import { decrypt, encrypt } from "./crypto.js";
import { admin } from "./supabase.js";
import type { Briefing } from "./types.js";

export type SourceKind = "stripe" | "sentry" | "posthog" | "revenuecat";

/** Store (encrypted) a connected source credential for a user. */
export async function saveSource(
  userId: string,
  kind: SourceKind,
  label: string,
  secret: string,
): Promise<void> {
  const { error } = await admin
    .from("sources")
    .upsert({ user_id: userId, kind, label, secret_enc: encrypt(secret) });
  if (error) throw new Error(`Failed to save source: ${error.message}`);
}

/** Decrypted credential for a user's connected source, or null. */
export async function getSourceSecret(
  userId: string,
  kind: SourceKind,
): Promise<{ label: string | null; secret: string } | null> {
  const { data, error } = await admin
    .from("sources")
    .select("label, secret_enc")
    .eq("user_id", userId)
    .eq("kind", kind)
    .maybeSingle();
  if (error) throw new Error(`Failed to load source: ${error.message}`);
  if (!data) return null;
  return { label: data.label, secret: decrypt(data.secret_enc) };
}

/** Disconnect a source (lets the user reconnect with a different key/account). */
export async function deleteSource(userId: string, kind: SourceKind): Promise<void> {
  const { error } = await admin
    .from("sources")
    .delete()
    .eq("user_id", userId)
    .eq("kind", kind);
  if (error) throw new Error(`Failed to disconnect: ${error.message}`);
}

/** Which sources a user has connected (kind + label only — no secrets). */
export async function listSources(
  userId: string,
): Promise<{ kind: string; label: string | null }[]> {
  const { data, error } = await admin
    .from("sources")
    .select("kind, label")
    .eq("user_id", userId);
  if (error) throw new Error(`Failed to list sources: ${error.message}`);
  return data ?? [];
}

/** Persist a briefing for a user (one row per run; latest is newest). */
export async function saveBriefing(userId: string, briefing: Briefing): Promise<void> {
  const { error } = await admin
    .from("briefings")
    .insert({ user_id: userId, data: briefing });
  if (error) throw new Error(`Failed to save briefing: ${error.message}`);
}

/** The user's most recent briefing, or null if they've never run one. */
export async function getLatestBriefing(userId: string): Promise<Briefing | null> {
  const { data, error } = await admin
    .from("briefings")
    .select("data")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Failed to load briefing: ${error.message}`);
  return (data?.data as Briefing | undefined) ?? null;
}
