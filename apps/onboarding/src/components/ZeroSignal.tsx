import type { SourceCategory } from "../fixtures/sources";
import { missingSourceSuggestions } from "../lib/nudges";
import { SnoozeDoodle } from "./Doodles";

/**
 * The honest empty state: nobody flagged this run. Not a dead end — it points
 * at the optional sources that would deepen the read, category-aware.
 */
export function ZeroSignal({ cats }: { cats: Set<SourceCategory> }) {
  const suggestions = missingSourceSuggestions(cats);

  return (
    <div className="mx-auto max-w-2xl px-6 py-4">
      <div className="rise ph-card px-7 py-9 text-center">
        <SnoozeDoodle className="mx-auto h-16 w-20" />
        <h2 className="mt-4 font-display text-[26px] leading-tight font-bold tracking-[-0.015em]">
          Nobody's churning. Suspiciously quiet.
        </h2>
        <p
          className="mx-auto mt-2.5 max-w-md text-[14.5px] leading-relaxed"
          style={{ color: "var(--color-ink-soft)" }}
        >
          Nobody crossed the risk threshold this run. Either you're crushing it —
          or the brain needs more to go on. Wire up a signal or two and the next
          run catches the quiet ones earlier.
        </p>

        {suggestions.length > 0 ? (
          <div className="mt-7 flex flex-col gap-2.5 text-left">
            {suggestions.map((s) => (
              <div
                key={s.label}
                className="flex items-start gap-3 rounded-lg border px-4 py-3"
                style={{
                  borderColor: "var(--color-line)",
                  backgroundColor: "var(--color-paper)",
                }}
              >
                <span
                  className="mt-1 text-[13px]"
                  style={{ color: "var(--color-accent)" }}
                  aria-hidden
                >
                  +
                </span>
                <div className="flex flex-col gap-0.5">
                  <span className="text-[13.5px] font-semibold">{s.label}</span>
                  <span
                    className="text-[12.5px]"
                    style={{ color: "var(--color-ink-faint)" }}
                  >
                    {s.detail}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p
            className="mt-7 font-mono text-[12px]"
            style={{ color: "var(--color-ink-faint)" }}
          >
            Every source is connected — the brain will keep watching and surface
            users the moment risk builds.
          </p>
        )}
      </div>
    </div>
  );
}
