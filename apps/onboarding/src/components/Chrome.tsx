import type { ReactNode } from "react";
import type { Identity } from "../state/machine";
import { Brandmark } from "./Brandmark";
import { IdentityPill } from "./IdentityPill";

/**
 * The PostHog-style page chrome that wraps every screen: a darker textured
 * surround, a centered cream page panel with a hard ink border, a top nav, and
 * an "all systems operational" footer. Individual screens render only their own
 * content — the frame, nav, and footer live here.
 */
export function Shell({
  identity,
  onSignOut,
  children,
}: {
  identity: Identity | null;
  onSignOut?: () => void;
  children: ReactNode;
}) {
  return (
    <div className="ph-surround min-h-full px-3 py-4 sm:px-6 sm:py-7">
      <div
        className="paper-grain mx-auto max-w-3xl overflow-hidden rounded-[14px]"
        style={{
          border: "1.5px solid var(--color-edge)",
          boxShadow: "4px 4px 0 rgba(29,27,22,0.16)",
        }}
      >
        {/* Top bar hidden for now — re-enable <TopBar/> here when wanted. */}
        <div className="px-6 py-9 sm:px-9">{children}</div>
        <SiteFooter />
      </div>
    </div>
  );
}

function TopBar({
  identity,
  onSignOut,
}: {
  identity: Identity | null;
  onSignOut?: () => void;
}) {
  return (
    <header
      className="flex items-center justify-between gap-3 px-6 py-3.5 sm:px-9"
      style={{ borderBottom: "1.5px solid var(--color-edge)", backgroundColor: "var(--color-raised)" }}
    >
      <div className="flex items-center gap-6">
        <Brandmark />
        <nav className="hidden items-center gap-5 md:flex">
          {["Product", "Pricing", "Docs"].map((l) => (
            <span
              key={l}
              className="text-[13px] font-medium"
              style={{ color: "var(--color-ink-soft)" }}
            >
              {l}
            </span>
          ))}
        </nav>
      </div>
      <div className="flex items-center gap-2.5">
        {identity && <IdentityPill identity={identity} onSignOut={onSignOut} />}
        <span className="btn btn-primary px-3.5 py-1.5 text-[12.5px]">Dashboard</span>
      </div>
    </header>
  );
}

function SiteFooter() {
  return (
    <footer
      className="flex flex-col gap-3 px-6 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-9"
      style={{ borderTop: "1.5px solid var(--color-edge)", backgroundColor: "var(--color-raised)" }}
    >
      <span className="inline-flex items-center gap-2 font-mono text-[11px]" style={{ color: "var(--color-ink-soft)" }}>
        <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--color-positive)" }} />
        All systems operational
      </span>
      <div className="flex flex-wrap items-center gap-4 font-mono text-[11px]" style={{ color: "var(--color-ink-faint)" }}>
        <span>Privacy</span>
        <span>Terms</span>
        <span>Status</span>
        <span style={{ color: "var(--color-ink-faint)" }}>© retention·brain — no hedgehogs were harmed</span>
      </div>
    </footer>
  );
}
