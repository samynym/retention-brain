import { describe, it, expect } from "vitest";
import { sanitizeUserIdForFilename } from "./filename-safety.js";

describe("sanitizeUserIdForFilename", () => {
  it("preserves safe characters", () => {
    expect(sanitizeUserIdForFilename("user_42-abc")).toBe("user_42-abc");
  });

  it("strips path traversal segments", () => {
    expect(sanitizeUserIdForFilename("../../etc/passwd")).toBe("etc_passwd");
  });

  it("collapses slashes and NUL bytes", () => {
    expect(sanitizeUserIdForFilename("foo/bar\x00baz")).toBe("foo_bar_baz");
  });

  it("falls back to 'user' for input that strips to empty", () => {
    expect(sanitizeUserIdForFilename("/././")).toBe("user");
    expect(sanitizeUserIdForFilename("")).toBe("user");
    expect(sanitizeUserIdForFilename("...")).toBe("user");
  });

  it("caps length at 64 characters", () => {
    const long = "a".repeat(200);
    expect(sanitizeUserIdForFilename(long).length).toBe(64);
  });

  it("blocks the path-traversal exploit at the filename boundary", () => {
    // The intended use: filename = `${date}-${sanitized}-${slug}.md`, then
    // resolve(dir, filename). Must not contain `..` or `/` after sanitizing.
    const filename = `2026-05-12-${sanitizeUserIdForFilename("../../tmp/pwned")}-fix.md`;
    expect(filename).not.toContain("..");
    expect(filename).not.toContain("/");
  });
});
