import { ACCOUNT, SAMPLE_BRIEFINGS } from "../fixtures/briefings";
import type { SourceCategory } from "../fixtures/sources";
import { riskBand, shortDate } from "../lib/format";
import { briefingNudge } from "../lib/nudges";
import type { ConnState, Identity, Scenario } from "../state/machine";
import type { Briefing, CardUser } from "../types/briefing";
import { NudgeBanner } from "./NudgeBanner";
import { UserCard } from "./UserCard";
import { ZeroSignal } from "./ZeroSignal";

export function BriefingScreen({
  scenario,
  briefing,
  refreshing,
  analyzeError,
  cats,
  connectedCount,
  identity,
  gmail,
  onConnectGmail,
  onSignOut,
  allowFixtures = false,
}: {
  scenario: Scenario;
  briefing: Briefing | null;
  refreshing: boolean;
  analyzeError: string | null;
  cats: Set<SourceCategory>;
  connectedCount: number;
  identity: Identity | null;
  gmail: ConnState;
  onConnectGmail: () => void;
  onSignOut: () => void;
  allowFixtures?: boolean;
}) {
  const live = briefing !== null;
  const preview = !live && allowFixtures;

  // Build the card rows + masthead from either the live briefing or fixtures.
  const rows: CardUser[] = live
    ? briefing.users
    : !preview || scenario === "zero"
      ? []
      : SAMPLE_BRIEFINGS;

  const high = live
    ? briefing.account.high
    : rows.filter((b) => riskBand(b.risk.score) === "high").length;
  const medium = live
    ? briefing.account.medium
    : rows.filter((b) => riskBand(b.risk.score) === "medium").length;

  const appName = live ? "Your subscribers" : preview ? ACCOUNT.app : "Your subscribers";
  const subscribers = live ? briefing.account.total_users : preview ? ACCOUNT.subscribers : 0;
  const dateIso = live ? briefing.cutoff_iso : preview ? ACCOUNT.briefingDate : new Date().toISOString();
  const year = new Date(dateIso).getUTCFullYear();

  const nudge = briefingNudge(cats);

  return (
    <div className="flex min-h-full flex-col">
        {/* Masthead */}
        <header className="rise" style={{ animationDelay: "0ms" }}>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p
                className="flex items-center gap-2 font-mono text-[11px] tracking-[0.1em] uppercase"
                style={{ color: "var(--color-accent)" }}
              >
                Retention briefing{live ? " · live" : ""}
                {refreshing && (
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9.5px] tracking-[0.08em]"
                    style={{ backgroundColor: "var(--color-accent-wash)", color: "var(--color-accent-ink)" }}
                  >
                    <span className="blink h-1.5 w-1.5 rounded-full" style={{ backgroundColor: "var(--color-accent)" }} />
                    refreshing
                  </span>
                )}
              </p>
              <h1 className="mt-1.5 font-display text-[34px] leading-none font-medium tracking-[-0.02em]">
                {appName}
              </h1>
            </div>
            <div
              className="text-right font-mono text-[12px]"
              style={{ color: "var(--color-ink-faint)" }}
            >
              <p>{shortDate(dateIso)}, {year} · {subscribers} subscribers</p>
              <p className="mt-0.5">
                {connectedCount} source{connectedCount === 1 ? "" : "s"} connected
              </p>
            </div>
          </div>
        </header>

        {analyzeError ? (
          <AnalyzeError message={analyzeError} />
        ) : (
          <>
            {/* Summary line */}
            <p
              className="rise mt-6 font-display text-[22px] leading-snug tracking-[-0.01em]"
              style={{ animationDelay: "70ms" }}
            >
              {rows.length === 0 ? (
                <>Nobody's leaving today. Suspicious, but we'll take it.</>
              ) : (
                <>
                  <Count n={high} color="var(--color-risk-high)" label="about to bail" />
                  <span style={{ color: "var(--color-ink-faint)" }}>, </span>
                  <Count n={medium} color="var(--color-risk-med)" label="wobbling" />
                  <span style={{ color: "var(--color-ink-faint)" }}>
                    {" "}
                    — we already drafted the saves.
                  </span>
                </>
              )}
            </p>

            {nudge && (
              <div className="mt-6">
                <NudgeBanner nudge={nudge} delayMs={130} />
              </div>
            )}

            {live && briefing.warnings && briefing.warnings.length > 0 && (
              <div
                className="rise mt-6 rounded-lg border px-5 py-4"
                style={{ borderColor: "var(--color-line-strong)", backgroundColor: "var(--color-raised)", animationDelay: "130ms" }}
              >
                <p className="text-[13.5px] font-semibold" style={{ color: "var(--color-risk-high)" }}>
                  {briefing.warnings.length === 1 ? "A source couldn't be read" : "Some sources couldn't be read"}
                </p>
                <p className="mt-1 text-[12.5px] leading-snug" style={{ color: "var(--color-ink-soft)" }}>
                  This briefing skipped{" "}
                  {briefing.warnings.map((w) => w.source.replace(/^mcp:/, "")).join(", ")}{" "}
                  — reconnect them and re-run. The rest of the briefing is unaffected.
                </p>
              </div>
            )}

            {rows.length === 0 ? (
              <div className="mt-8">
                <ZeroSignal cats={cats} />
              </div>
            ) : (
              <div className="mt-8 flex flex-col gap-5">
                {rows.map((u, i) => (
                  <UserCard
                    key={u.user_id}
                    user={u}
                    index={i}
                    delayMs={200 + i * 90}
                    gmail={gmail}
                    onConnectGmail={onConnectGmail}
                  />
                ))}
              </div>
            )}

            <footer
              className="rise mt-10 border-t pt-6 text-center"
              style={{ borderColor: "var(--color-line)", animationDelay: "600ms" }}
            >
              <p
                className="font-mono text-[11px] tracking-[0.04em]"
                style={{ color: "var(--color-ink-faint)" }}
              >
                Read-only · nothing has been sent · drafts await your review
              </p>
            </footer>
          </>
        )}
    </div>
  );
}

function AnalyzeError({ message }: { message: string }) {
  return (
    <div
      className="rise mt-8 rounded-xl border px-6 py-8 text-center"
      style={{ borderColor: "var(--color-line-strong)", backgroundColor: "var(--color-raised)" }}
    >
      <h2 className="font-display text-[24px] font-medium tracking-[-0.01em]">
        Couldn't run the analysis.
      </h2>
      <p className="mx-auto mt-2 max-w-md text-[13.5px]" style={{ color: "var(--color-ink-soft)" }}>
        {message}
      </p>
      <p className="mt-4 font-mono text-[11.5px]" style={{ color: "var(--color-ink-faint)" }}>
        Is the backend running? Start it with `pnpm --filter @retention-brain/server start`.
      </p>
    </div>
  );
}

function Count({ n, color, label }: { n: number; color: string; label: string }) {
  return (
    <span>
      <span className="tnum font-medium" style={{ color }}>
        {n}
      </span>{" "}
      <span style={{ color: "var(--color-ink)" }}>
        user{n === 1 ? "" : "s"} {label}
      </span>
    </span>
  );
}
