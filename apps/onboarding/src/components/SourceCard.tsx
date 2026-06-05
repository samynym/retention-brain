import { useState } from "react";
import type { SourceConn } from "../state/machine";
import type { SourceDef } from "../fixtures/sources";

/**
 * A connectable source. Connect simulates an OAuth / MCP round-trip; pure mock.
 *
 * Single-provider OAuth sources (Sentry) connect on click. Key-based sources
 * (RevenueCat, Stripe) open a small form for the read-only key.
 * Multi-provider slots (analytics, support) first ask *which* tool you use —
 * because the brain connects that tool's MCP server, not a generic one. Pick
 * PostHog and it's PostHog's MCP that authorizes; Mixpanel and Amplitude stay
 * untouched. "Other billing" takes an arbitrary MCP server by reference.
 */
export function SourceCard({
  source,
  conn,
  onConnect,
  onConnectSecret,
  onConnectOAuth,
}: {
  source: SourceDef;
  conn: SourceConn;
  onConnect: (id: string, provider: string) => void;
  /** real connect for secret_key sources (Stripe, RevenueCat) — validates server-side */
  onConnectSecret?: (id: string, secret: string) => Promise<{ ok: boolean; error?: string }>;
  /** real connect for oauth sources (Sentry, PostHog) — redirects to the provider */
  onConnectOAuth?: (provider: string) => void;
}) {
  const [open, setOpen] = useState(false);
  // within a picker, whether the "Other (any MCP)" endpoint form is showing
  const [showMcp, setShowMcp] = useState(false);
  // secret_key flow
  const [secret, setSecret] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [keyError, setKeyError] = useState("");
  // re-entering a key on an already-connected source
  const [editingKey, setEditingKey] = useState(false);
  const connected = conn.status === "connected";
  const connecting = conn.status === "connecting" || submitting;
  const interactive = !connected && !connecting;
  const connectedLabel =
    source.connectVia === "secret_key" || source.connectVia === "oauth"
      ? (source.providers[0] ?? source.name)
      : (conn.provider ?? "Connected");

  async function submitSecret() {
    const key = secret.trim();
    if (!key || !onConnectSecret || submitting) return;
    setSubmitting(true);
    setKeyError("");
    const res = await onConnectSecret(source.id, key);
    setSubmitting(false);
    if (!res.ok) setKeyError(res.error ?? "Couldn't connect.");
    else {
      setOpen(false);
      setEditingKey(false);
      setSecret("");
    }
  }

  function activate() {
    if (!interactive) return;
    if (source.connectVia === "direct") {
      onConnect(source.id, source.providers[0] ?? source.name);
    } else if (source.connectVia === "oauth") {
      if (onConnectOAuth && source.oauthProvider) onConnectOAuth(source.oauthProvider);
    } else {
      setShowMcp(false);
      setOpen((o) => !o);
    }
  }

  function pick(provider: string) {
    setOpen(false);
    setShowMcp(false);
    onConnect(source.id, provider);
  }

  return (
    <div
      className="ph-card relative flex h-full flex-col gap-3 p-4 transition-all duration-200"
      style={{
        boxShadow: connected
          ? "3px 3px 0 rgba(17,156,140,0.18)"
          : "3px 3px 0 rgba(29,27,22,0.13)",
        borderColor: connected ? "var(--color-teal-edge)" : "var(--color-edge)",
      }}
    >
      <button
        type="button"
        disabled={!interactive}
        onClick={activate}
        className="flex flex-col gap-3 text-left disabled:cursor-default"
        aria-expanded={open}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-0.5">
            <span className="text-[15px] font-semibold tracking-[-0.01em]">
              {source.name}
            </span>
            <span className="text-[12px]" style={{ color: "var(--color-ink-faint)" }}>
              {source.blurb}
            </span>
          </div>
          <StatusDot status={conn.status} />
        </div>
        <span
          className="text-[12.5px] leading-snug"
          style={{ color: "var(--color-ink-soft)" }}
        >
          {source.unlocks}
        </span>
      </button>

      {/* Action / status line */}
      <div className="mt-auto flex items-center pt-0.5">
        {connected ? (
          <span className="inline-flex items-center gap-2.5">
            <span
              className="inline-flex items-center gap-1.5 font-mono text-[11px] tracking-[0.06em] uppercase"
              style={{ color: "var(--color-positive)" }}
            >
              <CheckIcon /> {connectedLabel}
            </span>
            {source.connectVia === "secret_key" && !editingKey && (
              <button
                type="button"
                onClick={() => {
                  setEditingKey(true);
                  setKeyError("");
                }}
                className="font-mono text-[10px] tracking-[0.06em] uppercase transition-colors"
                style={{ color: "var(--color-ink-faint)" }}
              >
                change
              </button>
            )}
            {source.connectVia === "oauth" && onConnectOAuth && source.oauthProvider && (
              <button
                type="button"
                onClick={() => onConnectOAuth(source.oauthProvider!)}
                className="font-mono text-[10px] tracking-[0.06em] uppercase transition-colors"
                style={{ color: "var(--color-ink-faint)" }}
              >
                reconnect
              </button>
            )}
          </span>
        ) : connecting ? (
          <span
            className="inline-flex items-center gap-2 font-mono text-[11px] tracking-[0.06em] uppercase"
            style={{ color: "var(--color-ink-soft)" }}
          >
            <Spinner /> {connectingLabel(source, conn.provider)}
          </span>
        ) : (
          <button
            type="button"
            onClick={activate}
            className="font-mono text-[11px] tracking-[0.06em] uppercase transition-colors"
            style={{ color: "var(--color-accent)" }}
          >
            {idleLabel(source, open)}
          </button>
        )}
      </div>

      {/* Provider chooser (picker sources) */}
      {open && interactive && source.connectVia === "picker" && (
        <div
          className="fade flex flex-col gap-2 rounded-md border p-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <span
            className="font-mono text-[10px] tracking-[0.08em] uppercase"
            style={{ color: "var(--color-ink-faint)" }}
          >
            Which tool do you use?
          </span>
          <div className="flex flex-wrap gap-1.5">
            {source.providers.map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => pick(p)}
                className="rounded-md border px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors hover:border-[var(--color-accent)]"
                style={{
                  borderColor: "var(--color-line-strong)",
                  color: "var(--color-ink)",
                  backgroundColor: "var(--color-raised)",
                }}
              >
                {p}
              </button>
            ))}
            {source.allowOtherMcp && (
              <button
                type="button"
                onClick={() => setShowMcp((v) => !v)}
                aria-pressed={showMcp}
                className="rounded-md border border-dashed px-2.5 py-1.5 text-[12.5px] font-semibold transition-colors"
                style={{
                  borderColor: showMcp ? "var(--color-accent)" : "var(--color-line-strong)",
                  color: showMcp ? "var(--color-accent-ink)" : "var(--color-ink-soft)",
                  backgroundColor: showMcp ? "var(--color-accent-wash)" : "transparent",
                }}
              >
                Other (any MCP)
              </button>
            )}
          </div>

          {showMcp ? (
            <div className="flex flex-col gap-2">
              <span
                className="font-mono text-[10px] tracking-[0.08em] uppercase"
                style={{ color: "var(--color-ink-faint)" }}
              >
                Point it at any {source.category} MCP server
              </span>
              <div
                className="rounded border px-2.5 py-2 font-mono text-[11.5px]"
                style={{
                  borderColor: "var(--color-line-strong)",
                  backgroundColor: "var(--color-raised)",
                  color: "var(--color-ink-soft)",
                }}
              >
                npx -y @your-org/{source.id}-mcp
              </div>
              <button
                type="button"
                onClick={() => pick("Custom MCP")}
                className="self-start rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
                style={{ backgroundColor: "var(--color-accent)", color: "#fcf6f1" }}
              >
                Connect via MCP
              </button>
            </div>
          ) : (
            <span className="text-[11px] leading-snug" style={{ color: "var(--color-ink-faint)" }}>
              Connects that tool's MCP server, read-only. Don't see yours? Any MCP
              server works.
            </span>
          )}
        </div>
      )}

      {/* MCP endpoint (other billing) */}
      {open && interactive && source.connectVia === "mcp_endpoint" && (
        <div
          className="fade flex flex-col gap-2 rounded-md border p-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <span
            className="font-mono text-[10px] tracking-[0.08em] uppercase"
            style={{ color: "var(--color-ink-faint)" }}
          >
            Point it at any billing MCP server
          </span>
          <div
            className="rounded border px-2.5 py-2 font-mono text-[11.5px]"
            style={{
              borderColor: "var(--color-line-strong)",
              backgroundColor: "var(--color-raised)",
              color: "var(--color-ink-soft)",
            }}
          >
            npx -y @your-org/billing-mcp
          </div>
          <button
            type="button"
            onClick={() => pick("Custom MCP")}
            className="self-start rounded-md px-3 py-1.5 text-[12.5px] font-semibold"
            style={{ backgroundColor: "var(--color-accent)", color: "#fcf6f1" }}
          >
            Connect via MCP
          </button>
        </div>
      )}

      {/* Secret key (Stripe, RevenueCat) — connect or re-enter to swap the key */}
      {(editingKey || (open && !connected)) && source.connectVia === "secret_key" && (
        <div
          className="fade flex flex-col gap-2 rounded-md border p-3"
          style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-paper)" }}
        >
          <input
            type="password"
            value={secret}
            onChange={(e) => setSecret(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitSecret()}
            disabled={submitting}
            spellCheck={false}
            autoComplete="off"
            placeholder={source.keyPlaceholder ?? "key…"}
            className="w-full rounded border bg-transparent px-2.5 py-2 font-mono text-[12px] focus:outline-none disabled:opacity-60"
            style={{ borderColor: "var(--color-line-strong)", color: "var(--color-ink)" }}
          />
          {source.keyHelp && (
            <span className="text-[11px] leading-snug" style={{ color: "var(--color-ink-faint)" }}>
              {source.keyHelp}
            </span>
          )}
          {source.keyScopes && source.keyScopes.length > 0 && (
            <div
              className="flex flex-col gap-1.5 rounded border px-2.5 py-2"
              style={{
                borderColor: "var(--color-line)",
                backgroundColor: "var(--color-raised)",
              }}
            >
              <span
                className="font-mono text-[9.5px] tracking-[0.08em] uppercase"
                style={{ color: "var(--color-ink-faint)" }}
              >
                Select these permissions
              </span>
              <div className="flex flex-wrap gap-1.5">
                {source.keyScopes.map((scope) => (
                  <span
                    key={scope}
                    className="rounded border px-2 py-1 font-mono text-[10.5px]"
                    style={{
                      borderColor: "var(--color-line-strong)",
                      color: "var(--color-ink-soft)",
                      backgroundColor: "var(--color-paper)",
                    }}
                  >
                    {scope}
                  </span>
                ))}
              </div>
            </div>
          )}
          {source.keyLink && (
            <a
              href={source.keyLink.url}
              target="_blank"
              rel="noreferrer"
              className="font-mono text-[11px] tracking-[0.04em] uppercase transition-colors hover:underline"
              style={{ color: "var(--color-accent)" }}
            >
              {source.keyLink.label}
            </a>
          )}
          {keyError && (
            <span className="text-[11.5px]" style={{ color: "var(--color-risk-high)" }}>
              {keyError}
            </span>
          )}
          <button
            type="button"
            onClick={submitSecret}
            disabled={submitting || secret.trim().length === 0}
            className="btn btn-primary self-start px-3.5 py-1.5 text-[12.5px]"
          >
            {submitting ? "Validating…" : "Connect"}
          </button>
        </div>
      )}

      {connecting && (
        <span className="sweep pointer-events-none absolute inset-0 rounded-lg" aria-hidden />
      )}
    </div>
  );
}

function idleLabel(source: SourceDef, open: boolean): string {
  if (source.connectVia === "direct") return "Connect →";
  if (source.connectVia === "oauth") return `Connect ${source.providers[0] ?? ""} →`.replace("  ", " ");
  if (source.connectVia === "mcp_endpoint") return open ? "Close" : "Add MCP server →";
  if (source.connectVia === "secret_key") return open ? "Close" : "Connect →";
  return open ? "Close" : "Choose your tool →";
}

function connectingLabel(source: SourceDef, provider?: string): string {
  if (source.connectVia === "direct") return "Connecting…";
  if (source.connectVia === "secret_key") return "Validating…";
  return `Connecting ${provider ?? "MCP"}…`;
}

function StatusDot({ status }: { status: SourceConn["status"] }) {
  const color =
    status === "connected"
      ? "var(--color-positive)"
      : status === "connecting"
        ? "var(--color-accent)"
        : "var(--color-line-strong)";
  return (
    <span
      className={`mt-1 h-2 w-2 shrink-0 rounded-full ${status === "connecting" ? "blink" : ""}`}
      style={{ backgroundColor: color }}
      aria-hidden
    />
  );
}

function Spinner() {
  return (
    <svg className="h-3 w-3 animate-spin" viewBox="0 0 16 16" fill="none" aria-hidden>
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg className="h-3 w-3" viewBox="0 0 16 16" fill="none" aria-hidden>
      <path
        d="M3.5 8.5l3 3 6-7"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
