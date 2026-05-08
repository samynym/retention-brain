// Shared 429-retry helper for connectors that hit upstream REST APIs.
// Honors Retry-After (seconds), falls back to linear backoff, max 3 retries.
// Caller handles non-2xx + body extraction since error formats differ per provider.

export type FetchWithRetryOpts = {
  maxRetries?: number;
  baseBackoffMs?: number;
};

export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: FetchWithRetryOpts = {},
): Promise<Response> {
  const maxRetries = opts.maxRetries ?? 3;
  const baseBackoffMs = opts.baseBackoffMs ?? 1000;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429 || attempt === maxRetries) return res;
    const retryAfter = Number(res.headers.get("retry-after"));
    const waitMs =
      Number.isFinite(retryAfter) && retryAfter > 0
        ? retryAfter * 1000
        : baseBackoffMs * (attempt + 1);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  // unreachable — loop returns on success or final 429
  throw new Error("fetchWithRetry: exhausted retries");
}
