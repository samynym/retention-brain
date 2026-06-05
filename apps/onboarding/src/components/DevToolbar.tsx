import type { AppView, Phase, Scenario } from "../state/machine";

/**
 * Small dev-only affordance (clearly not product UI) to flip the result
 * dataset between the sample briefing and the zero-signal state, jump to the
 * operator dashboard, and reset the flow. Mono, muted, pinned to the corner.
 */
export function DevToolbar({
  phase,
  scenario,
  view,
  onScenario,
  onView,
  onReset,
}: {
  phase: Phase;
  scenario: Scenario;
  view: AppView;
  onScenario: (s: Scenario) => void;
  onView: (v: AppView) => void;
  onReset: () => void;
}) {
  const inOperator = view === "operator";
  return (
    <div
      className="fixed right-4 bottom-4 z-50 flex items-center gap-1 rounded-full px-1.5 py-1"
      style={{
        border: "1.5px solid var(--color-edge)",
        backgroundColor: "var(--color-raised)",
        boxShadow: "2px 2px 0 var(--color-edge)",
      }}
    >
      <span
        className="px-2 font-mono text-[9.5px] tracking-[0.12em] uppercase"
        style={{ color: "var(--color-ink-faint)" }}
      >
        dev
      </span>

      <Seg active={!inOperator && scenario === "sample"} onClick={() => { onView("app"); onScenario("sample"); }}>
        Sample
      </Seg>
      <Seg active={!inOperator && scenario === "zero"} onClick={() => { onView("app"); onScenario("zero"); }}>
        Zero-signal
      </Seg>

      <span className="mx-0.5 h-4 w-px" style={{ backgroundColor: "var(--color-line)" }} />

      <Seg active={inOperator} onClick={() => onView(inOperator ? "app" : "operator")}>
        Operator
      </Seg>

      <span className="mx-0.5 h-4 w-px" style={{ backgroundColor: "var(--color-line)" }} />

      <button
        type="button"
        onClick={onReset}
        disabled={
          !inOperator &&
          (phase === "signin" || phase === "checking" || phase === "not_allowed")
        }
        className="rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.04em] uppercase transition-colors disabled:opacity-40"
        style={{ color: "var(--color-ink-soft)" }}
      >
        Reset
      </button>
    </div>
  );
}

function Seg({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-full px-2.5 py-1 font-mono text-[10px] tracking-[0.04em] uppercase transition-colors"
      style={{
        backgroundColor: active ? "var(--color-ink)" : "transparent",
        color: active ? "#f7f8fa" : "var(--color-ink-faint)",
      }}
    >
      {children}
    </button>
  );
}
