import { z } from "zod";
import { fetchWithRetry } from "@rcrb/sources";

const DEFAULT_HOST = "https://sentry.io";

export type SentryConfig = {
  authToken: string;
  orgSlug: string;
  projectSlug: string;
  host?: string;
};

export const SentryIssue = z.object({
  id: z.string(),
  shortId: z.string().optional(),
  level: z.string().optional(),
  title: z.string().optional(),
  culprit: z.string().nullable().optional(),
  permalink: z.string().optional(),
  status: z.string().optional(),
  firstSeen: z.string().optional(),
  lastSeen: z.string().optional(),
});
export type SentryIssue = z.infer<typeof SentryIssue>;

export const SentryUser = z.object({
  id: z.string().nullable().optional(),
  email: z.string().nullable().optional(),
  username: z.string().nullable().optional(),
  ip_address: z.string().nullable().optional(),
});

export const SentryEventDetail = z.object({
  id: z.string(),
  eventID: z.string().optional(),
  dateCreated: z.string(),
  message: z.string().nullable().optional(),
  title: z.string().optional(),
  user: SentryUser.nullable().optional(),
  level: z.string().optional(),
});
export type SentryEventDetail = z.infer<typeof SentryEventDetail>;

// MAX_PAGES = 100 at 100 items/page = 10k issues — generous backfill ceiling
const MAX_PAGES = 100;

export function sentryApi(config: SentryConfig) {
  const host = config.host ?? DEFAULT_HOST;
  const headers = {
    Authorization: `Bearer ${config.authToken}`,
    Accept: "application/json",
  };

  async function get(url: string): Promise<{ json: unknown; linkHeader: string | null }> {
    const res = await fetchWithRetry(url, { headers });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(`Sentry ${res.status} ${res.statusText}: ${body}`);
    }
    return { json: await res.json(), linkHeader: res.headers.get("link") };
  }

  // Sentry pagination follows RFC 5988 Link headers shaped like:
  //   <url>; rel="next"; results="true"; cursor="..."
  // results="false" means there's no more data even if a next URL is present.
  function parseNextLink(linkHeader: string | null): string | null {
    if (!linkHeader) return null;
    const links = linkHeader.split(",").map((s) => s.trim());
    for (const link of links) {
      const match = /^<([^>]+)>.*?rel="next"/i.exec(link);
      if (match && match[1]) {
        if (/results="false"/i.test(link)) return null;
        return match[1];
      }
    }
    return null;
  }

  async function* paginate<T>(initialUrl: string, schema: z.ZodType<T>): AsyncIterable<T> {
    let next: string | null = initialUrl;
    let pages = 0;
    while (next) {
      if (++pages > MAX_PAGES) throw new Error(`Sentry pagination exceeded ${MAX_PAGES} pages`);
      const { json, linkHeader } = await get(next);
      const items = Array.isArray(json) ? json : [];
      for (const item of items) yield schema.parse(item);
      next = parseNextLink(linkHeader);
    }
  }

  const projectPath = `/api/0/projects/${encodeURIComponent(config.orgSlug)}/${encodeURIComponent(config.projectSlug)}`;
  const orgPath = `/api/0/organizations/${encodeURIComponent(config.orgSlug)}`;

  return {
    listIssues(opts: { statsPeriod?: string } = {}): AsyncIterable<SentryIssue> {
      const period = opts.statsPeriod ?? "14d";
      return paginate(`${host}${projectPath}/issues/?statsPeriod=${period}&limit=100`, SentryIssue);
    },
    listIssueEvents(issueId: string): AsyncIterable<SentryEventDetail> {
      return paginate(
        `${host}${orgPath}/issues/${encodeURIComponent(issueId)}/events/?limit=100`,
        SentryEventDetail,
      );
    },
  };
}
