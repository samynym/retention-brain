import { BILLING_SOURCES, OPTIONAL_SOURCES } from "../fixtures/sources";
import type { Identity, State } from "../state/machine";
import { connOf, hasBilling } from "../state/machine";
import { RadarDoodle } from "./Doodles";
import { SourceCard } from "./SourceCard";

export function ConnectScreen({
  state,
  onConnect,
  onConnectSecret,
  onConnectOAuth,
  onAnalyze,
}: {
  state: State;
  identity: Identity | null;
  onConnect: (id: string, provider: string) => void;
  onConnectSecret: (id: string, secret: string) => Promise<{ ok: boolean; error?: string }>;
  onConnectOAuth: (provider: string) => void;
  onAnalyze: () => void;
  onSignOut: () => void;
}) {
  const ready = hasBilling(state);

  return (
    <div className="flex min-h-full flex-col">
        <div className="rise flex items-start justify-between gap-4" style={{ animationDelay: "60ms" }}>
          <div className="max-w-xl">
            <h1 className="font-display text-[38px] leading-[1.02] font-bold tracking-[-0.025em] sm:text-[48px]">
              See who's about to churn
              <span style={{ color: "var(--color-accent)" }}> — and what to send them.</span>
            </h1>
            <p
              className="mt-5 max-w-lg text-[16px] leading-relaxed"
              style={{ color: "var(--color-ink-soft)" }}
            >
              Point it at your billing data and it tells you, per actual human
              user, who's slipping, why, and the exact email to win them back.
              Read-only.{" "}
              <span className="font-semibold" style={{ color: "var(--color-ink)" }}>
                We will never message your users behind your back.
              </span>
            </p>
          </div>
          <RadarDoodle className="hidden h-24 w-28 shrink-0 sm:block" />
        </div>

        {/* Required billing */}
        <section className="rise mt-12" style={{ animationDelay: "200ms" }}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center gap-2.5">
                <h2 className="text-[13px] font-semibold tracking-[0.04em] uppercase">
                  Billing source
                </h2>
                <span
                  className="rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.1em] uppercase"
                  style={{
                    backgroundColor: "var(--color-accent-wash)",
                    color: "var(--color-accent-ink)",
                  }}
                >
                  Required
                </span>
              </div>
              <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
                You only need{" "}
                <span className="font-semibold" style={{ color: "var(--color-ink-soft)" }}>
                  one
                </span>
                . RevenueCat, Stripe, both, or any MCP billing source — whatever's
                counting your money.
              </p>
            </div>
            <RequirementChip met={ready} />
          </div>

          {/* At least one required — connect any, or several. */}
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {BILLING_SOURCES.map((s) => (
              <SourceCard
                key={s.id}
                source={s}
                conn={connOf(state, s.id)}
                onConnect={onConnect}
                onConnectSecret={onConnectSecret}
                onConnectOAuth={onConnectOAuth}
              />
            ))}
          </div>
        </section>

        {/* Optional signals */}
        <section className="rise mt-10" style={{ animationDelay: "270ms" }}>
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2.5">
              <h2 className="text-[13px] font-semibold tracking-[0.04em] uppercase">
                Optional signals
              </h2>
              <span
                className="rounded-full px-2 py-0.5 font-mono text-[9.5px] tracking-[0.1em] uppercase"
                style={{ backgroundColor: "var(--color-sunk)", color: "var(--color-ink-faint)" }}
              >
                Optional
              </span>
            </div>
            <p className="text-[13px]" style={{ color: "var(--color-ink-faint)" }}>
              Not required, but each one makes the “why” way less hand-wavy.
            </p>
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {OPTIONAL_SOURCES.map((s) => (
              <SourceCard
                key={s.id}
                source={s}
                conn={connOf(state, s.id)}
                onConnect={onConnect}
                onConnectSecret={onConnectSecret}
                onConnectOAuth={onConnectOAuth}
              />
            ))}
          </div>
        </section>

        {/* Analyze CTA */}
        <div
          className="rise mt-12 flex flex-col items-start gap-3 pt-7 sm:flex-row sm:items-center sm:justify-between"
          style={{ borderTop: "1.5px solid var(--color-edge)", animationDelay: "340ms" }}
        >
          <p
            className="max-w-sm text-[13px] leading-snug"
            style={{ color: "var(--color-ink-faint)" }}
          >
            {ready
              ? "Billing's in. We run it on our model — you don't lift a finger."
              : "Connect one billing source and we'll go find your at-risk users."}
          </p>
          <button
            type="button"
            disabled={!ready}
            onClick={onAnalyze}
            className="btn btn-primary group px-6 py-3 text-[15px]"
          >
            Analyze my subscribers
            <span
              className="transition-transform duration-200 group-enabled:group-hover:translate-x-0.5"
              aria-hidden
            >
              →
            </span>
          </button>
        </div>
    </div>
  );
}

/** Live "0 of 1" → "Requirement met" tracker — makes the gate unmistakable. */
function RequirementChip({ met }: { met: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 font-mono text-[10.5px] tracking-[0.06em] uppercase transition-colors"
      style={
        met
          ? {
              borderColor: "var(--color-positive)",
              color: "var(--color-positive)",
              backgroundColor: "var(--color-raised)",
            }
          : {
              borderColor: "var(--color-line-strong)",
              color: "var(--color-accent-ink)",
              backgroundColor: "var(--color-accent-wash)",
            }
      }
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: met ? "var(--color-positive)" : "var(--color-accent)" }}
      />
      {met ? "Requirement met" : "Connect at least 1"}
    </span>
  );
}

