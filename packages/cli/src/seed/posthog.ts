import type { Event } from "@rcrb/core";
import { fetchWithRetry } from "@rcrb/sources";
import type { SeedPushResult } from "./types.js";

export type PostHogSeedConfig = {
  projectApiKey: string;
  host?: string;
};

const DEFAULT_INGEST_HOST = "https://us.i.posthog.com";

const KIND_TO_PH_EVENT: Record<string, string> = {
  "usage.session": "$session_start",
  "usage.feature": "feature_used",
  "subscription.purchase": "subscription_purchased",
  "subscription.renewal": "subscription_renewed",
  "subscription.cancel": "subscription_cancelled",
  "subscription.refund": "subscription_refunded",
  "support.ticket_open": "support_ticket_opened",
  "review.submitted": "review_submitted",
};

export async function pushPostHogEvents(
  cfg: PostHogSeedConfig,
  events: Event[]
): Promise<SeedPushResult & { source: "posthog" }> {
  const result = {
    source: "posthog" as const,
    customers_created: 0,
    customers_deleted: 0,
    events_pushed: 0,
    events_skipped: 0,
    notes: [] as string[],
  };
  const host = cfg.host ?? DEFAULT_INGEST_HOST;
  const url = `${host}/capture/`;

  // Capture in batches of 100 via the /batch/ endpoint when supported, but
  // /capture/ accepts arrays via {batch:[...]}. We use that.
  const batchUrl = `${host}/batch/`;
  const BATCH_SIZE = 100;
  for (let i = 0; i < events.length; i += BATCH_SIZE) {
    const slice = events.slice(i, i + BATCH_SIZE);
    const batch = slice
      .map((e) => {
        const phEvent = KIND_TO_PH_EVENT[e.kind];
        if (!phEvent) return null;
        return {
          event: phEvent,
          distinct_id: e.user_id,
          timestamp: e.timestamp,
          properties: {
            rcrb_seed: true,
            rcrb_kind: e.kind,
            ...e.payload,
          },
        };
      })
      .filter((x): x is NonNullable<typeof x> => x !== null);
    if (batch.length === 0) {
      result.events_skipped += slice.length;
      continue;
    }
    try {
      const res = await fetchWithRetry(batchUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // historical_migration tells PostHog to honor the timestamp we send
        // instead of clamping to receive-time, which is required when seeding
        // a synthetic timeline that spans past dates.
        body: JSON.stringify({
          api_key: cfg.projectApiKey,
          historical_migration: true,
          batch,
        }),
      });
      if (res.ok) {
        result.events_pushed += batch.length;
        result.events_skipped += slice.length - batch.length;
      } else {
        // fall back to single capture
        let okCount = 0;
        for (const item of batch) {
          const single = await fetchWithRetry(url, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              api_key: cfg.projectApiKey,
              historical_migration: true,
              ...item,
            }),
          });
          if (single.ok) okCount++;
        }
        result.events_pushed += okCount;
        result.events_skipped += slice.length - okCount;
        if (result.notes.length < 3) {
          result.notes.push(`batch ${res.status}; fell back to single capture`);
        }
      }
    } catch (err) {
      result.events_skipped += slice.length;
      if (result.notes.length < 3) {
        result.notes.push(
          `capture error: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }
  return result;
}
