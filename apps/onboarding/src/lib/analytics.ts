import { supabase } from "./supabase";

const BASE = import.meta.env.VITE_API_URL ?? "http://localhost:8787";

export type AnalyticsEvent =
  | "sign_in_link_requested"
  | "sign_in_link_sent"
  | "sign_in_link_error"
  | "session_started"
  | "source_connect_started"
  | "source_connect_completed"
  | "source_connect_failed"
  | "analyze_started"
  | "analyze_failed"
  | "briefing_cached_shown"
  | "briefing_ready";

export async function track(
  event: AnalyticsEvent,
  properties: Record<string, string | number | boolean | null> = {},
): Promise<void> {
  try {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    await fetch(`${BASE}/api/analytics`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: JSON.stringify({ event, properties }),
      keepalive: true,
    });
  } catch {
    // Analytics must never block the onboarding flow.
  }
}
