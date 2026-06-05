import { useState } from "react";
import {
  channelLabel,
  eventStamp,
  offerLabel,
  signalLabel,
  timingLabel,
} from "../lib/format";
import type { ConnState } from "../state/machine";
import type { CardUser } from "../types/briefing";
import { NoOfferDoodle } from "./Doodles";
import { ContributionBar, RiskFigure } from "./RiskMeter";

/**
 * The per-user "user-play" rendered as UI — who, why (with signal evidence
 * referencing the user's actual events), the recommended play, and the drafted
 * email. Renders both live briefings and fixtures (CardUser). When the agent
 * recommended no action, the play/email blocks are replaced with a note. The
 * email can be edited inline and sent via a (mock) Gmail MCP connection.
 */
export function UserCard({
  user,
  index,
  delayMs,
  gmail,
  onConnectGmail,
}: {
  user: CardUser;
  index: number;
  delayMs: number;
  gmail: ConnState;
  onConnectGmail: () => void;
}) {
  const { risk, intervention, events } = user;
  const [showEvidence, setShowEvidence] = useState(false);

  // Directly-editable copy (mock; in-memory only). Always editable — just
  // click into the subject or body and change it.
  const [subject, setSubject] = useState(intervention?.copy.subject ?? "");
  const [body, setBody] = useState(intervention?.copy.body ?? "");
  const [sendState, setSendState] = useState<"idle" | "sending" | "sent">("idle");
  const locked = sendState !== "idle";

  const archetype =
    user.archetype ?? `${signalLabel(risk.top_signals[0]?.name ?? "flagged")} risk`;

  function send() {
    if (gmail !== "connected" || sendState !== "idle") return;
    setSendState("sending");
    setTimeout(() => setSendState("sent"), 1000);
  }

  return (
    <article
      className="rise ph-card overflow-hidden"
      style={{
        boxShadow: "4px 4px 0 rgba(29,27,22,0.14)",
        animationDelay: `${delayMs}ms`,
      }}
    >
      {/* Header */}
      <header className="flex items-start justify-between gap-4 px-6 pt-6 pb-5">
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2.5">
            <span
              className="font-mono text-[11px] tabular-nums"
              style={{ color: "var(--color-ink-faint)" }}
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <span
              className="rounded-full px-2.5 py-0.5 text-[11px] font-medium tracking-[0.01em]"
              style={{ backgroundColor: "var(--color-sunk)", color: "var(--color-ink-soft)" }}
            >
              {archetype}
            </span>
          </div>
          <h3 className="text-[19px] font-semibold tracking-[-0.01em]">
            {user.email ?? user.user_id}
          </h3>
          {user.email && (
            <span className="font-mono text-[11.5px]" style={{ color: "var(--color-ink-faint)" }}>
              {user.user_id}
            </span>
          )}
        </div>
        <RiskFigure score={risk.score} />
      </header>

      <hr className="rule" />

      {/* WHY */}
      <section className="px-6 py-5">
        <Label>Why</Label>
        <p
          className="mt-2 font-display text-[16.5px] leading-snug italic"
          style={{ color: "var(--color-ink)" }}
        >
          {risk.narrative}
        </p>

        <ul className="mt-4 flex flex-col gap-3.5">
          {risk.top_signals.map((s, i) => (
            <li key={s.name} className="flex flex-col gap-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-[13px] font-semibold tracking-[-0.005em]">
                  {signalLabel(s.name)}
                </span>
                <span
                  className="tnum font-mono text-[10.5px]"
                  style={{ color: "var(--color-ink-faint)" }}
                >
                  {s.score.toFixed(2)} × {s.weight.toFixed(2)}
                </span>
              </div>
              <ContributionBar score={s.score} weight={s.weight} delayMs={delayMs + 120 + i * 90} />
              <p className="text-[13px] leading-snug" style={{ color: "var(--color-ink-soft)" }}>
                {s.reason}
              </p>
            </li>
          ))}
        </ul>

        <button
          type="button"
          onClick={() => setShowEvidence((v) => !v)}
          className="mt-4 inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.04em] uppercase transition-colors"
          style={{ color: "var(--color-ink-faint)" }}
        >
          <span
            className="inline-block transition-transform duration-200"
            style={{ transform: showEvidence ? "rotate(90deg)" : "none" }}
            aria-hidden
          >
            ▸
          </span>
          {showEvidence ? "Hide evidence" : `Evidence · ${events.length} events`}
        </button>

        {showEvidence && (
          <ol
            className="fade mt-3 flex flex-col gap-1.5 rounded-lg border px-4 py-3"
            style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
          >
            {events.map((e, i) => (
              <li key={i} className="flex items-baseline gap-3 font-mono text-[11.5px]">
                <span className="tnum w-[78px] shrink-0" style={{ color: "var(--color-ink-faint)" }}>
                  {eventStamp(e.timestamp)}
                </span>
                <span className="w-[150px] shrink-0" style={{ color: "var(--color-accent-ink)" }}>
                  {e.kind}
                </span>
                {e.detail && <span style={{ color: "var(--color-ink-soft)" }}>{e.detail}</span>}
              </li>
            ))}
          </ol>
        )}
      </section>

      {!intervention ? (
        <>
          <hr className="rule" />
          <section className="px-6 py-5">
            <Label>Recommended play</Label>
            <p className="mt-2 text-[14px] leading-snug" style={{ color: "var(--color-ink-soft)" }}>
              No action recommended this run — the signal is too borderline to
              warrant outreach yet. Re-evaluate next run.
            </p>
          </section>
        </>
      ) : (
      <>
      <hr className="rule" />

      {/* RECOMMENDED PLAY */}
      <section className="px-6 py-5">
        <div className="flex items-center justify-between gap-3">
          <Label>Recommended play</Label>
          {/no offer/i.test(offerLabel(intervention.offer.kind, intervention.offer.value)) && (
            <span className="inline-flex items-center gap-1.5" title="No discount — fix the relationship, not the price">
              <NoOfferDoodle className="h-7 w-7" />
              <span className="font-mono text-[10px] tracking-[0.04em] uppercase" style={{ color: "var(--color-ink-faint)" }}>
                no discount
              </span>
            </span>
          )}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2.5">
          <PlayPill k="Channel" v={channelLabel(intervention.channel)} />
          <PlayPill k="Offer" v={offerLabel(intervention.offer.kind, intervention.offer.value)} />
          <PlayPill k="Timing" v={timingLabel(intervention.timing)} />
        </div>
        <p className="mt-3.5 text-[13px] leading-snug" style={{ color: "var(--color-ink-soft)" }}>
          {intervention.reasoning}
        </p>
        {intervention.critique && (
          <p className="mt-2 font-mono text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
            critic: {intervention.critique.recommendation} ·{" "}
            {avg(intervention.critique.scores).toFixed(1)}/5
          </p>
        )}
      </section>

      {/* DRAFTED EMAIL — directly editable */}
      <section className="px-6 pb-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-baseline gap-2">
            <Label>Drafted {channelLabel(intervention.channel).toLowerCase()}</Label>
            {!locked && (
              <span
                className="inline-flex items-center gap-1 text-[11px]"
                style={{ color: "var(--color-ink-faint)" }}
              >
                <PencilGlyph /> editable
              </span>
            )}
          </div>
          <SendControl
            gmail={gmail}
            sendState={sendState}
            onConnectGmail={onConnectGmail}
            onSend={send}
          />
        </div>

        <div
          className="mt-3 overflow-hidden rounded-lg border"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <div className="border-b px-4 py-3" style={{ borderColor: "var(--color-line)" }}>
            <label
              className="font-mono text-[10px] tracking-[0.1em] uppercase"
              style={{ color: "var(--color-ink-faint)" }}
            >
              Subject
            </label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              disabled={locked}
              spellCheck={false}
              className="email-field mt-1 w-full rounded-md bg-transparent px-2 py-1 text-[14.5px] font-semibold tracking-[-0.005em] focus:outline-none disabled:opacity-100"
              style={{ color: "var(--color-ink)" }}
            />
          </div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={locked}
            spellCheck={false}
            rows={Math.min(20, body.split("\n").length + 1)}
            className="email-field w-full resize-y bg-transparent px-3 py-3 font-sans text-[13.5px] leading-relaxed focus:outline-none disabled:opacity-100"
            style={{ color: "var(--color-ink)" }}
          />
        </div>

        {sendState === "sent" && (
          <div
            className="fade mt-2.5 flex items-center gap-2 rounded-md border px-3 py-2"
            style={{ borderColor: "var(--color-line-strong)", backgroundColor: "var(--color-raised)" }}
          >
            <span
              className="h-1.5 w-1.5 rounded-full"
              style={{ backgroundColor: "var(--color-positive)" }}
            />
            <span className="text-[12.5px] font-medium" style={{ color: "var(--color-positive)" }}>
              Sent via Gmail
            </span>
            <span className="text-[11.5px]" style={{ color: "var(--color-ink-faint)" }}>
              mock — nothing actually left this browser
            </span>
          </div>
        )}
      </section>
      </>
      )}

      {/* TRIAGE — inert */}
      <footer
        className="flex flex-wrap items-center justify-between gap-3 border-t px-6 py-4"
        style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
      >
        <div className="flex items-center gap-2">
          <GhostAction primary>Approve</GhostAction>
          <GhostAction>Skip</GhostAction>
        </div>
        <span className="font-mono text-[10.5px] tracking-[0.04em]" style={{ color: "var(--color-ink-faint)" }}>
          queue actions land later · sending is mocked
        </span>
      </footer>
    </article>
  );
}

/** Connect-Gmail-then-send control for the email block. */
function SendControl({
  gmail,
  sendState,
  onConnectGmail,
  onSend,
}: {
  gmail: ConnState;
  sendState: "idle" | "sending" | "sent";
  onConnectGmail: () => void;
  onSend: () => void;
}) {
  if (sendState === "sent") {
    return (
      <span
        className="inline-flex items-center gap-1.5 px-2 font-mono text-[11px] tracking-[0.04em] uppercase"
        style={{ color: "var(--color-positive)" }}
      >
        Sent
      </span>
    );
  }
  if (sendState === "sending") {
    return (
      <span className="btn btn-primary px-3 py-1.5 text-[12.5px]" style={{ opacity: 0.85 }}>
        <MiniSpinner /> Sending…
      </span>
    );
  }
  if (gmail === "connected") {
    return (
      <button
        type="button"
        onClick={onSend}
        className="btn btn-primary px-3 py-1.5 text-[12.5px]"
      >
        <GmailGlyph /> Send via Gmail
      </button>
    );
  }
  if (gmail === "connecting") {
    return (
      <span
        className="inline-flex items-center gap-1.5 rounded-md border px-3 py-1.5 text-[12.5px] font-semibold"
        style={{ borderColor: "var(--color-line-strong)", color: "var(--color-ink-soft)" }}
      >
        <MiniSpinner /> Connecting Gmail…
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onConnectGmail}
      className="btn btn-secondary px-3 py-1.5 text-[12.5px]"
      title="Connect the Gmail MCP to send drafts from here"
    >
      <GmailGlyph /> Connect Gmail to send
    </button>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="font-mono text-[10.5px] tracking-[0.14em] uppercase"
      style={{ color: "var(--color-ink-faint)" }}
    >
      {children}
    </span>
  );
}

function PencilGlyph() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M11.5 2.5l2 2L6 12l-2.5.5L4 10l7.5-7.5z"
        stroke="currentColor"
        strokeWidth="1.2"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlayPill({ k, v }: { k: string; v: string }) {
  return (
    <div
      className="flex flex-col gap-1 rounded-md border px-3 py-2.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
    >
      <span
        className="font-mono text-[9.5px] tracking-[0.1em] uppercase"
        style={{ color: "var(--color-ink-faint)" }}
      >
        {k}
      </span>
      <span
        className="text-[13.5px] font-semibold tracking-[-0.005em]"
        style={{ color: "var(--color-ink)" }}
      >
        {v}
      </span>
    </div>
  );
}

function GhostAction({ children, primary = false }: { children: React.ReactNode; primary?: boolean }) {
  return (
    <button
      type="button"
      className="rounded-md border bg-transparent px-3.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:bg-[var(--color-sunk)]"
      style={
        primary
          ? { borderColor: "var(--color-edge)", color: "var(--color-ink)" }
          : { borderColor: "var(--color-line-strong)", color: "var(--color-ink-soft)" }
      }
    >
      {children}
    </button>
  );
}

function MiniSpinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.3" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function GmailGlyph() {
  return (
    <svg className="h-3 w-3.5" viewBox="0 0 18 14" fill="none" aria-hidden>
      <rect x="0.6" y="0.6" width="16.8" height="12.8" rx="1.6" stroke="currentColor" strokeWidth="1.2" />
      <path d="M1 1.5l8 5.5 8-5.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  );
}

function avg(scores: Record<string, number>): number {
  const vals = Object.values(scores);
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}
