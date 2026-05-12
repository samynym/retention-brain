/**
 * Make a user-supplied identifier safe to interpolate into a filename.
 *
 * user_id flows in from external sources — RC `app_user_id`, PostHog
 * `distinct_id`, LLM-normalized records from arbitrary MCP servers — so a raw
 * value can contain `..`, `/`, NUL, or other path-traversal characters. Naive
 * use as a filename segment with `resolve()` can write outside the intended
 * directory.
 *
 * Reduce to [A-Za-z0-9_-], collapse runs of underscores, trim leading/trailing
 * separators, cap at 64 chars, and fall back to "user" if nothing usable is
 * left.
 */
export function sanitizeUserIdForFilename(userId: string): string {
  const cleaned = userId
    .replace(/[^A-Za-z0-9_-]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^[_-]+|[_-]+$/g, "")
    .slice(0, 64);
  return cleaned.length > 0 ? cleaned : "user";
}
