import { OPERATOR, type DevRow } from "../fixtures/operator";

/**
 * The operator/beta dashboard — what the person who shipped the tool sees
 * across their 50 invited devs. Usage funnel + per-dev activity, all
 * product-usage metadata. No briefing content, no customer billing data:
 * with BYO-key + local compute the analysis stays on each dev's machine.
 */
export function OperatorView({ onBack }: { onBack: () => void }) {
  const maxCount = OPERATOR.funnel[0]?.count ?? OPERATOR.invited;

  return (
    <div className="flex min-h-full flex-col">
        <header className="rise flex items-center justify-between">
          <button
            type="button"
            onClick={onBack}
            className="font-mono text-[11px] tracking-[0.04em] uppercase"
            style={{ color: "var(--color-accent)" }}
          >
            ← Back to app
          </button>
          <span
            className="rounded-full border px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] uppercase"
            style={{ borderColor: "var(--color-line-strong)", color: "var(--color-ink-faint)" }}
          >
            Beta · Operator
          </span>
        </header>

        <hr className="rule mt-4" />

        <div className="rise mt-5 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p
              className="font-mono text-[11px] tracking-[0.1em] uppercase"
              style={{ color: "var(--color-accent)" }}
            >
              Your beta
            </p>
            <h1 className="mt-1.5 font-display text-[34px] leading-none font-medium tracking-[-0.02em]">
              {OPERATOR.invited} invited · {OPERATOR.activeThisWeek} active
            </h1>
            <p className="mt-2 text-[14px]" style={{ color: "var(--color-ink-soft)" }}>
              Last analysis run {OPERATOR.lastRunAgo}.
            </p>
          </div>
          <div className="text-right">
            <p
              className="font-mono text-[10px] tracking-[0.1em] uppercase"
              style={{ color: "var(--color-ink-faint)" }}
            >
              Model spend · this week
            </p>
            <p className="tnum mt-1 font-display text-[30px] leading-none font-medium">
              {OPERATOR.spendThisWeek}
            </p>
            <p className="mt-1.5 max-w-[15rem] text-[11.5px] leading-snug" style={{ color: "var(--color-ink-faint)" }}>
              Runs on your model key — this is the cost you absorb.
            </p>
          </div>
        </div>

        {/* Privacy posture — the whole point of BYO-key */}
        <div
          className="rise mt-6 flex items-start gap-3.5 rounded-lg border px-5 py-4"
          style={{ borderColor: "var(--color-line-strong)", backgroundColor: "var(--color-raised)" }}
        >
          <span
            className="mt-1.5 h-2 w-2 shrink-0 rounded-full"
            style={{ backgroundColor: "var(--color-positive)" }}
          />
          <p className="text-[13px] leading-snug" style={{ color: "var(--color-ink-soft)" }}>
            <span className="font-semibold" style={{ color: "var(--color-ink)" }}>
              You see usage, never customer data.
            </span>{" "}
            Each dev runs on their own model key and their own bill, so every
            briefing's content stays on their machine. The only content that
            reaches you is what a dev explicitly chooses to share.
          </p>
        </div>

        {/* Funnel */}
        <section className="rise mt-9">
          <SectionLabel>Activation funnel</SectionLabel>
          <div className="mt-4 flex flex-col gap-2.5">
            {OPERATOR.funnel.map((step) => (
              <div key={step.label} className="flex items-center gap-4">
                <span
                  className="w-[150px] shrink-0 text-[13px]"
                  style={{ color: "var(--color-ink-soft)" }}
                >
                  {step.label}
                </span>
                <div
                  className="h-6 flex-1 overflow-hidden rounded"
                  style={{ backgroundColor: "var(--color-sunk)" }}
                >
                  <div
                    className="meter-fill h-full rounded"
                    style={{
                      width: `${(step.count / maxCount) * 100}%`,
                      backgroundColor: "var(--color-accent)",
                      opacity: 0.5,
                    }}
                  />
                </div>
                <span
                  className="tnum w-8 shrink-0 text-right font-mono text-[13px] font-medium"
                >
                  {step.count}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* Per-dev activity */}
        <section className="rise mt-9">
          <SectionLabel>Active devs</SectionLabel>
          <div className="ph-card mt-4 overflow-hidden">
            <div
              className="grid grid-cols-[1.6fr_1.3fr_0.7fr_0.8fr_1fr] gap-3 border-b px-4 py-2.5 font-mono text-[10px] tracking-[0.08em] uppercase"
              style={{ borderColor: "var(--color-line)", color: "var(--color-ink-faint)" }}
            >
              <span>Dev</span>
              <span>Sources</span>
              <span className="text-right">Runs</span>
              <span className="text-right">Cost</span>
              <span className="text-right">Last active</span>
            </div>
            {OPERATOR.devs.map((dev) => (
              <DevRowItem key={dev.id} dev={dev} />
            ))}
          </div>
          <p className="mt-3 text-[12.5px]" style={{ color: "var(--color-ink-faint)" }}>
            {OPERATOR.sharedForReview} devs opted to share a briefing for quality
            review — the only path that surfaces actual copy to you.
          </p>
          <p className="mt-1 text-[12.5px]" style={{ color: "var(--color-ink-faint)" }}>
            Cost is estimated model spend at default routing (cheap model for
            scoring, mid model for drafts) — not what you'd necessarily charge.
          </p>
        </section>
    </div>
  );
}

function DevRowItem({ dev }: { dev: DevRow }) {
  return (
    <div
      className="grid grid-cols-[1.6fr_1.3fr_0.7fr_0.8fr_1fr] items-center gap-3 border-b px-4 py-3 text-[13px] last:border-b-0"
      style={{ borderColor: "var(--color-line)" }}
    >
      <div className="flex items-center gap-2">
        <span className="font-mono text-[12.5px]">{dev.emailMasked}</span>
        {dev.sharedBriefing && (
          <span
            className="rounded px-1.5 py-0.5 font-mono text-[8.5px] tracking-[0.06em] uppercase"
            style={{ backgroundColor: "var(--color-accent-wash)", color: "var(--color-accent-ink)" }}
            title="Shared a briefing for review"
          >
            shared
          </span>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {dev.sources.length === 0 ? (
          <span style={{ color: "var(--color-ink-faint)" }}>—</span>
        ) : (
          dev.sources.map((s) => (
            <span
              key={s}
              className="rounded px-1.5 py-0.5 text-[10.5px]"
              style={{ backgroundColor: "var(--color-sunk)", color: "var(--color-ink-soft)" }}
            >
              {s}
            </span>
          ))
        )}
      </div>
      <span className="tnum text-right font-mono">{dev.analyses}</span>
      <span
        className="tnum text-right font-mono"
        style={{ color: dev.cost === "$0.00" ? "var(--color-ink-faint)" : "var(--color-ink)" }}
      >
        {dev.cost}
      </span>
      <span className="text-right text-[12px]" style={{ color: "var(--color-ink-soft)" }}>
        {dev.lastActive}
      </span>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-[13px] font-semibold tracking-[0.04em] uppercase">{children}</h2>
  );
}
