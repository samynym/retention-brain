import { Brandmark } from "./Brandmark";

/** Brief splash while the Supabase session is verified on load. */
export function CheckingScreen() {
  return (
    <div className="paper-grain flex min-h-full items-center justify-center px-6">
      <div className="fade flex flex-col items-center gap-4">
        <Brandmark />
        <span
          className="font-mono text-[11px] tracking-[0.1em] uppercase"
          style={{ color: "var(--color-ink-faint)" }}
        >
          <span className="blink">·</span> checking session
        </span>
      </div>
    </div>
  );
}
