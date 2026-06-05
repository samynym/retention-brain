/**
 * Original loose-line doodles in PostHog's hand-drawn spirit — deliberately NOT
 * their mascot (Max the hedgehog is their trademark). Slightly irregular paths,
 * round caps, ink stroke on transparent. Each takes a className for sizing.
 */

const stroke = {
  fill: "none",
  stroke: "var(--color-edge)",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

/** Magnifier sweeping over a little crowd — the "see who's at risk" mark. */
export function RadarDoodle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 96" className={className} aria-hidden role="img">
      {/* little crowd of heads */}
      <g {...stroke}>
        <circle cx="26" cy="58" r="7" />
        <path d="M16 78c0-7 4-11 10-11s10 4 10 11" />
        <circle cx="50" cy="64" r="6" />
        <path d="M41 80c0-6 4-9 9-9s9 3 9 9" />
        <circle cx="73" cy="60" r="6.5" />
        <path d="M64 78c0-6 4-10 9-10s9 4 9 10" />
      </g>
      {/* the at-risk one, dashed + a spark */}
      <g {...stroke} strokeDasharray="3 3">
        <circle cx="96" cy="40" r="7" />
      </g>
      <path {...stroke} d="M96 26v-6M108 33l5-3M84 33l-5-3" strokeWidth={1.6} />
      {/* magnifier */}
      <g {...stroke}>
        <circle cx="62" cy="34" r="20" />
        <path d="M77 49l16 16" strokeWidth={3} />
      </g>
    </svg>
  );
}

/** A coin with a slash through it — the "no discount, fix the relationship" mark. */
export function NoOfferDoodle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" className={className} aria-hidden role="img">
      <g {...stroke}>
        <circle cx="22" cy="24" r="11" />
        <path d="M22 18v12M19 21h4.5a2.5 2.5 0 0 1 0 5H19M19 26h5" strokeWidth={1.6} />
        {/* the "no" ring + slash, drawn loose */}
        <circle cx="24" cy="24" r="20" strokeWidth={2.4} />
        <path d="M10 38L38 10" strokeWidth={2.4} />
      </g>
    </svg>
  );
}

/** Snoozing screen — the honest empty state. */
export function SnoozeDoodle({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 120 100" className={className} aria-hidden role="img">
      <g {...stroke}>
        {/* monitor */}
        <rect x="20" y="30" width="64" height="44" rx="4" />
        <path d="M44 74h16M52 74v8M40 82h24" />
        {/* closed sleepy eyes */}
        <path d="M36 50c3 3 7 3 10 0M58 50c3 3 7 3 10 0" strokeWidth={1.8} />
      </g>
      {/* zzz */}
      <g {...stroke} strokeWidth={1.8}>
        <path d="M86 30h10l-10 10h10" />
        <path d="M100 18h7l-7 7h7" />
      </g>
    </svg>
  );
}
