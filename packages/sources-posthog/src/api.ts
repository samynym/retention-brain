import { z } from "zod";
import { fetchWithRetry } from "@rcrb/sources";

// PostHog has separate ingest (us.i.posthog.com) and API (us.posthog.com) hosts.
// We're reading from the API, not ingesting.
const DEFAULT_HOST = "https://us.posthog.com";

export type PostHogConfig = {
  personalApiKey: string;
  projectId: string;
  host?: string;
};

export const PostHogPerson = z.object({
  id: z.union([z.string(), z.number()]).optional(),
  uuid: z.string().optional(),
  distinct_ids: z.array(z.string()).optional(),
  properties: z.record(z.unknown()).optional(),
});
export type PostHogPerson = z.infer<typeof PostHogPerson>;

export const PostHogEvent = z.object({
  id: z.string(),
  event: z.string(),
  timestamp: z.string(),
  distinct_id: z.string(),
  properties: z.record(z.unknown()).optional(),
  // PostHog inlines person on /events/ responses; null when unidentified.
  person: PostHogPerson.nullable().optional(),
});
export type PostHogEvent = z.infer<typeof PostHogEvent>;

const ListResponse = z.object({
  results: z.array(z.unknown()),
  next: z.string().nullable().optional(),
});

// 500 pages × 1000 items = 500k events — covers ~100-user 60-day runs.
const MAX_PAGES = 500;
const PAGE_LIMIT = 1000;

export function postHogApi(config: PostHogConfig) {
  const host = config.host ?? DEFAULT_HOST;
  const headers = {
    Authorization: `Bearer ${config.personalApiKey}`,
    Accept: "application/json",
  };

  async function get(url: string): Promise<unknown> {
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`PostHog ${res.status} ${res.statusText}: ${body}`);
    }
    return res.json();
  }

  async function* paginate<T>(initialUrl: string, schema: z.ZodType<T>): AsyncIterable<T> {
    let next: string | null = initialUrl;
    let pages = 0;
    while (next) {
      if (++pages > MAX_PAGES) throw new Error(`PostHog pagination exceeded ${MAX_PAGES} pages`);
      const raw = await get(next);
      const parsed = ListResponse.parse(raw);
      for (const item of parsed.results) yield schema.parse(item);
      next = parsed.next ?? null;
    }
  }

  const projectPath = `/api/projects/${encodeURIComponent(config.projectId)}`;

  return {
    listEvents(opts: { since: Date; until: Date }): AsyncIterable<PostHogEvent> {
      // PostHog's /events/ endpoint silently caps date-bounded responses; using
      // `after` only and filtering `before` client-side avoids the truncation.
      const after = opts.since.toISOString();
      const untilMs = opts.until.getTime();
      const inner = paginate(
        `${host}${projectPath}/events/?after=${encodeURIComponent(after)}&limit=${PAGE_LIMIT}`,
        PostHogEvent,
      );
      return (async function* () {
        for await (const e of inner) {
          if (new Date(e.timestamp).getTime() < untilMs) yield e;
        }
      })();
    },
  };
}
