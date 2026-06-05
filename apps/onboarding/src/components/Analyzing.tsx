import { useEffect, useState } from "react";
import { Brandmark } from "./Brandmark";

const STEPS = [
  "Pulling subscribers from billing…",
  "Joining usage, errors, and support per user…",
  "Scoring churn risk across the cohort…",
  "Drafting interventions for the at-risk…",
];

/**
 * The loader shown while a run is in flight (first run only — re-runs show the
 * cached briefing instead). A real run drafts interventions with the model, so
 * it can take ~a minute: the status lines keep cycling and an elapsed counter
 * makes the wait feel intentional rather than stuck.
 */
export function Analyzing() {
  const [step, setStep] = useState(0);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const cycle = setInterval(() => setStep((s) => (s + 1) % STEPS.length), 2600);
    const clock = setInterval(() => setElapsed((e) => e + 1), 1000);
    return () => {
      clearInterval(cycle);
      clearInterval(clock);
    };
  }, []);

  return (
    <div className="flex min-h-[440px] items-center justify-center px-6">
      <div className="flex w-full max-w-md flex-col items-center text-center">
        <Brandmark />

        <h2 className="fade mt-10 font-display text-[30px] leading-tight font-medium tracking-[-0.01em]">
          Analyzing your subscribers
        </h2>
        <p
          className="fade mt-2 text-[14px]"
          style={{ color: "var(--color-ink-soft)", animationDelay: "80ms" }}
        >
          The agent is scoring risk and drafting interventions. This can take a
          minute on the first run.
        </p>

        {/* sweeping progress rule */}
        <div
          className="sweep relative mt-9 h-[2px] w-full overflow-hidden rounded-full"
          style={{ backgroundColor: "var(--color-sunk)" }}
        />

        {/* cycling status + elapsed */}
        <div className="mt-6 flex h-5 items-center gap-3">
          <p
            key={step}
            className="fade font-mono text-[12px] tracking-[0.02em]"
            style={{ color: "var(--color-ink-soft)" }}
          >
            {STEPS[step]}
          </p>
          <span
            className="tnum font-mono text-[11px]"
            style={{ color: "var(--color-ink-faint)" }}
          >
            {elapsed}s
          </span>
        </div>
      </div>
    </div>
  );
}
