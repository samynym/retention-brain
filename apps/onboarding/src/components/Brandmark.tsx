/** Small wordmark for the masthead. A single ember pulse over a quiet rule. */
export function Brandmark({ subtle = false }: { subtle?: boolean }) {
  return (
    <div className="flex items-center gap-2.5 select-none">
      <span className="relative flex h-2.5 w-2.5 items-center justify-center">
        <span
          className="absolute h-2.5 w-2.5 rounded-full"
          style={{ backgroundColor: "var(--color-accent)", opacity: 0.25 }}
        />
        <span
          className="h-1.5 w-1.5 rounded-full"
          style={{ backgroundColor: "var(--color-accent)" }}
        />
      </span>
      <span
        className="font-mono text-[12px] tracking-[0.18em] uppercase"
        style={{ color: subtle ? "var(--color-ink-faint)" : "var(--color-ink-soft)" }}
      >
        retention<span style={{ color: "var(--color-accent)" }}>·</span>brain
      </span>
    </div>
  );
}
