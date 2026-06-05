import type { Identity } from "../state/machine";

/** "Signed in as" indicator with the operator's email + an optional sign-out. */
export function IdentityPill({
  identity,
  onSignOut,
}: {
  identity: Identity;
  onSignOut?: () => void;
}) {
  return (
    <span
      className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5"
      style={{ borderColor: "var(--color-line)", backgroundColor: "var(--color-raised)" }}
    >
      <span
        className="h-1.5 w-1.5 rounded-full"
        style={{ backgroundColor: "var(--color-positive)" }}
        aria-hidden
      />
      <span className="font-mono text-[11px]" style={{ color: "var(--color-ink-soft)" }}>
        {identity.email}
      </span>
      {onSignOut && (
        <button
          type="button"
          onClick={onSignOut}
          title="Sign out"
          className="font-mono text-[10px] tracking-[0.04em] uppercase transition-colors hover:text-[var(--color-accent)]"
          style={{ color: "var(--color-ink-faint)" }}
        >
          ↪
        </button>
      )}
    </span>
  );
}
