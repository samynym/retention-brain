import type { Nudge } from "../lib/nudges";

/** Category-aware nudge shown above the briefing — prompt or completion. */
export function NudgeBanner({ nudge, delayMs }: { nudge: Nudge; delayMs: number }) {
  const isComplete = nudge.tone === "complete";
  return (
    <div
      className="rise flex items-start gap-3.5 rounded-lg border px-5 py-4"
      style={{
        animationDelay: `${delayMs}ms`,
        borderColor: isComplete ? "var(--color-line-strong)" : "var(--color-line-strong)",
        backgroundColor: isComplete ? "var(--color-raised)" : "var(--color-accent-wash)",
      }}
    >
      <span
        className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
        style={{
          backgroundColor: isComplete
            ? "var(--color-positive)"
            : "var(--color-accent)",
        }}
        aria-hidden
      />
      <div className="flex flex-col gap-1">
        <p
          className="text-[14px] font-semibold tracking-[-0.005em]"
          style={{ color: isComplete ? "var(--color-ink)" : "var(--color-accent-ink)" }}
        >
          {nudge.headline}
        </p>
        <p
          className="text-[13px] leading-snug"
          style={{ color: "var(--color-ink-soft)" }}
        >
          {nudge.body}
        </p>
      </div>
    </div>
  );
}
