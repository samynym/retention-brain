# rc-retention-brain — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship v1 of rc-retention-brain — a continuous, cross-source, per-user retention agent with 4 sources (RC, Stripe, Sentry, PostHog) — installable on real sandboxes in <10 min and producing a markdown briefing. v1 is briefing-only; `--send` and the rest of the source roadmap come in v1.x.

**Architecture:** TypeScript monorepo. Source-agnostic core (normalized `Event` + `Intervention` types). Pluggable `Source` and `Channel` interfaces. Risk engine = heuristic signals + LLM-judge over per-user timeline. Intervention agent = specialist sub-agents (channel/offer/timing/copy) with critic pass. Eval harness uses synthetic ground truth + LLM-as-judge.

**Tech Stack:** Node 22 · TypeScript 5.6 · pnpm workspaces · tsx for dev/CLI · Vitest for tests · Vercel AI SDK · Anthropic Claude Sonnet 4.6 · Zod for schema validation · pino for structured logging

**Spec:** see `SPEC.md` in the same directory.

---

## Phase Map

Each phase = roughly one focused Claude session (1-3 agent-hours). Each phase ends with a green test/eval run + a commit. Phases run in order; later phases assume earlier phases shipped.

| # | Phase | Output |
|---|---|---|
| 0 ✅ | Bootstrap | Workspace, configs, CI skeleton, first commit |
| 1 ✅ | Core types + synthetic source | `Event`, `Intervention`, `Source` interface, simulator with 7 personas, ground truth |
| 2 ✅ | Risk engine | Signals + LLM judge + combined score, validated on synthetic ground truth |
| 3 ✅ | Intervention agent | Sub-agent pipeline, structured `Intervention` output |
| 4 ✅ | Eval harness | Prediction + intervention evals, LLM-as-judge rubric, markdown report |
| 5 ✅ | CLI + `demo` command | `npx rc-retention-brain demo` works end-to-end on synthetic data |
| **5.5** | **Eval methodology fixes** | **Adversarial personas, seed split, pre-registered thresholds, non-self-judging critic** |
| 6 | 4 source connectors | RC, Stripe, Sentry, PostHog — pluggable, ≥1 of {RC, Stripe} required |
| 7 | Briefing renderer + seed-sandbox | `run` writes briefing markdown; `seed-sandbox` populates RC/Stripe/Sentry/PostHog with realistic users |
| 8 | Install polish + DM | `init`, `--watch`, README install-first, screen recording, DM drafted |

**v0 ✅ = end of Phase 5.** **v1.0 = end of Phase 8.** Resend channel + `--send` deferred to v1.1.

---

## Phase 0: Bootstrap

**Goal:** Workspace is set up, CI runs, "hello world" passes. Anything later assumes this works.

**Files:**
- Create: `package.json` (workspace root)
- Create: `pnpm-workspace.yaml`
- Create: `tsconfig.base.json`
- Create: `.gitignore`
- Create: `.env.example`
- Create: `.github/workflows/ci.yml`
- Create: `README.md` (placeholder)
- Create: `LICENSE` (MIT)
- Create: `vitest.config.ts`

### Tasks

- [ ] **Init git repo + first commit baseline**

```bash
cd ~/dev/rc-retention-brain
git init
git branch -M main
```

- [ ] **Write workspace `package.json`**

```json
{
  "name": "rc-retention-brain",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.12.0",
  "engines": { "node": ">=22.0.0" },
  "scripts": {
    "build": "pnpm -r build",
    "test": "vitest run",
    "test:watch": "vitest",
    "lint": "tsc -b --noEmit",
    "demo": "tsx packages/cli/src/index.ts demo"
  },
  "devDependencies": {
    "@types/node": "^22.0.0",
    "tsx": "^4.19.0",
    "typescript": "^5.6.0",
    "vitest": "^2.1.0"
  }
}
```

- [ ] **Write `pnpm-workspace.yaml`**

```yaml
packages:
  - "packages/*"
```

- [ ] **Write `tsconfig.base.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "noUncheckedIndexedAccess": true,
    "declaration": true,
    "sourceMap": true
  }
}
```

- [ ] **Write `.gitignore`**

```
node_modules/
dist/
.env
.env.local
.DS_Store
*.log
coverage/
.vitest-cache/
interventions/
briefing-*.md
```

- [ ] **Write `.env.example`**

```bash
# LLM
ANTHROPIC_API_KEY=

# Sources (Phase 6)
REVENUECAT_API_KEY=
REVENUECAT_PROJECT_ID=
STRIPE_API_KEY=
MIXPANEL_PROJECT_ID=
MIXPANEL_API_SECRET=
SENTRY_AUTH_TOKEN=
SENTRY_ORG_SLUG=
SENTRY_PROJECT_SLUG=
CRISP_IDENTIFIER=
CRISP_KEY=
CRISP_WEBSITE_ID=
POSTHOG_PROJECT_API_KEY=
POSTHOG_PERSONAL_API_KEY=
POSTHOG_HOST=https://us.i.posthog.com
FIREBASE_PROJECT_ID=
FIREBASE_BIGQUERY_DATASET=
GOOGLE_APPLICATION_CREDENTIALS=

# Channel (Phase 7)
RESEND_API_KEY=
RESEND_FROM_EMAIL=
```

- [ ] **Write `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    include: ["packages/**/*.test.ts"],
    coverage: { provider: "v8", reporter: ["text", "html"] }
  }
});
```

- [ ] **Write `.github/workflows/ci.yml`**

```yaml
name: CI
on:
  push: { branches: [main] }
  pull_request: { branches: [main] }
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with: { version: 9.12.0 }
      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm lint
      - run: pnpm test
```

- [ ] **Write `LICENSE`** (MIT, year 2026, your name)

- [ ] **Write placeholder `README.md`**

```markdown
# rc-retention-brain

A continuous, cross-source, per-user retention agent for subscription apps.

**Status:** in development. See `SPEC.md` and `PLAN.md`.

MIT License.
```

- [ ] **Run `pnpm install` and `pnpm test`**

Run: `pnpm install && pnpm test`
Expected: install succeeds, vitest reports "No test files found" (passes with 0 tests — fine at this stage).

- [ ] **Commit Phase 0**

```bash
git add .
git commit -m "chore: bootstrap workspace, CI, configs"
```

---

## Phase 1: Core types + synthetic source

**Goal:** Normalized event types are defined; the synthetic source generates a deterministic 30-day event stream for 1000 users with ground-truth churn labels. Risk + intervention engines (later phases) consume from this exact contract.

**Files:**
- Create: `packages/core/package.json`
- Create: `packages/core/tsconfig.json`
- Create: `packages/core/src/index.ts`
- Create: `packages/core/src/events.ts`
- Create: `packages/core/src/intervention.ts`
- Create: `packages/core/src/user-timeline.ts`
- Create: `packages/sources/package.json`
- Create: `packages/sources/tsconfig.json`
- Create: `packages/sources/src/source.ts`
- Create: `packages/sources/src/synthetic/personas/{loyal,wavering,lapsing,fresh,power,lapsed-returning,free-rider}.ts` (7 files)
- Create: `packages/sources/src/synthetic/personas/index.ts`
- Create: `packages/sources/src/synthetic/ground-truth.ts`
- Create: `packages/sources/src/synthetic/generate.ts`
- Create: `packages/sources/src/synthetic/index.ts`
- Test: `packages/sources/src/synthetic/generate.test.ts`

### Tasks

- [ ] **Scaffold `packages/core` package**

`packages/core/package.json`:
```json
{
  "name": "@rcrb/core",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "tsc -b" },
  "dependencies": { "zod": "^3.23.0" }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"]
}
```

- [ ] **Define `Event` schema in `packages/core/src/events.ts`**

```ts
import { z } from "zod";

export const EventKind = z.enum([
  "subscription.purchase",
  "subscription.renewal",
  "subscription.cancel",
  "subscription.refund",
  "subscription.trial_start",
  "subscription.trial_end",
  "payment.success",
  "payment.failure",
  "payment.retry",
  "usage.session",
  "usage.feature",
  "support.ticket_open",
  "support.ticket_message",
  "support.ticket_close",
  "error.client",
  "error.crash",
  "review.submitted",
]);
export type EventKind = z.infer<typeof EventKind>;

export const Event = z.object({
  id: z.string(),
  user_id: z.string(),
  kind: EventKind,
  timestamp: z.string().datetime(),
  source: z.enum([
    "synthetic",
    "revenuecat",
    "stripe",
    "mixpanel",
    "sentry",
    "crisp",
    "posthog",
    "firebase",
  ]),
  // Free-form payload — schema enforced per kind in adapters
  payload: z.record(z.unknown()),
});
export type Event = z.infer<typeof Event>;
```

- [ ] **Define `UserTimeline` in `packages/core/src/user-timeline.ts`**

```ts
import { Event } from "./events.js";

export type UserTimeline = {
  user_id: string;
  email?: string;
  created_at: string; // first event timestamp
  events: Event[];    // sorted asc by timestamp
};

export function buildTimelines(events: Event[]): UserTimeline[] {
  const byUser = new Map<string, Event[]>();
  for (const e of events) {
    const arr = byUser.get(e.user_id) ?? [];
    arr.push(e);
    byUser.set(e.user_id, arr);
  }
  return Array.from(byUser.entries()).map(([user_id, evs]) => {
    evs.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    return { user_id, created_at: evs[0]!.timestamp, events: evs };
  });
}
```

- [ ] **Define `Intervention` in `packages/core/src/intervention.ts`**

```ts
import { z } from "zod";

export const Channel = z.enum(["email", "push", "in_app", "dunning_fix", "no_op"]);
export type Channel = z.infer<typeof Channel>;

export const OfferKind = z.enum([
  "discount_percent",
  "discount_amount",
  "extension_days",
  "upgrade_incentive",
  "feature_unlock",
  "none",
]);
export type OfferKind = z.infer<typeof OfferKind>;

export const Intervention = z.object({
  user_id: z.string(),
  risk_score: z.number().min(0).max(1),
  channel: Channel,
  offer: z.object({
    kind: OfferKind,
    value: z.number().optional(),
  }),
  timing: z.enum(["immediate", "next_session", "within_24h", "before_renewal"]),
  copy: z.object({
    subject: z.string().optional(),
    body: z.string(),
  }),
  reasoning: z.string(),               // 2-3 sentences why this play
  predicted_lift: z.object({
    direction: z.enum(["positive", "neutral", "negative"]),
    confidence: z.enum(["low", "medium", "high"]),
    note: z.string(),
  }),
});
export type Intervention = z.infer<typeof Intervention>;
```

- [ ] **Write `packages/core/src/index.ts`**

```ts
export * from "./events.js";
export * from "./user-timeline.js";
export * from "./intervention.js";
```

- [ ] **Scaffold `packages/sources` package**

`packages/sources/package.json`:
```json
{
  "name": "@rcrb/sources",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts",
    "./synthetic": "./src/synthetic/index.ts"
  },
  "scripts": { "build": "tsc -b" },
  "dependencies": {
    "@rcrb/core": "workspace:*",
    "zod": "^3.23.0",
    "seedrandom": "^3.0.5"
  },
  "devDependencies": {
    "@types/seedrandom": "^3.0.8"
  }
}
```

`packages/sources/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src/**/*"],
  "references": [{ "path": "../core" }]
}
```

- [ ] **Define `Source` interface in `packages/sources/src/source.ts`**

```ts
import { Event } from "@rcrb/core";

export type SourceConfig = Record<string, string | undefined>;

export interface Source {
  name: string;
  // Pull a backfill window of events
  backfill(opts: { since: Date; until: Date }): AsyncIterable<Event>;
  // Optional: subscribe to live events (for --watch). Not all sources support this.
  subscribe?(onEvent: (e: Event) => void): () => void;
}
```

- [ ] **Define personas (7 files)**

Each persona file follows the same shape. Example for `loyal.ts`:

```ts
import { Persona } from "./types.js";

export const loyal: Persona = {
  name: "loyal",
  weight: 0.30, // 30% of population
  profile: {
    sessions_per_week: { mean: 12, sd: 3 },
    feature_events_per_session: { mean: 8, sd: 2 },
    payment_failure_rate: 0.02,
    support_ticket_rate: 0.05,
    crash_rate: 0.01,
    will_churn: false,
    churn_window_days: null,
    churn_reason: null,
  },
};
```

Create `packages/sources/src/synthetic/personas/types.ts`:
```ts
export type Persona = {
  name: string;
  weight: number;
  profile: {
    sessions_per_week: { mean: number; sd: number };
    feature_events_per_session: { mean: number; sd: number };
    payment_failure_rate: number;
    support_ticket_rate: number;
    crash_rate: number;
    will_churn: boolean;
    churn_window_days: number | null;
    churn_reason: "usage_decline" | "payment_failure" | "support_complaint" | "crash_storm" | null;
  };
};
```

Personas (full table, all 7):

| Name | Weight | Sessions/wk | Will churn? | Churn window | Reason |
|---|---|---|---|---|---|
| loyal | 0.30 | 12±3 | No | — | — |
| power | 0.10 | 25±5 | No | — | — |
| fresh | 0.15 | 6±2 (rising) | No | — | — |
| wavering | 0.20 | 4±2 (declining) | 30% | 21 days | usage_decline |
| lapsing | 0.10 | 1±1 (cratering) | 80% | 7 days | usage_decline |
| lapsed_returning | 0.05 | 2±1 (recovering) | No | — | — |
| free_rider | 0.10 | 8±3 | 60% | 14 days | payment_failure |

For each persona, create the file in `packages/sources/src/synthetic/personas/<name>.ts` exporting a `Persona` per the type above. Adjust `profile` numbers to match this table. `lapsing` should also have `crash_rate: 0.15` (high crashes correlated with churn). `wavering` should have `support_ticket_rate: 0.20` (frustrated users open tickets).

`packages/sources/src/synthetic/personas/index.ts`:
```ts
import { loyal } from "./loyal.js";
import { power } from "./power.js";
import { fresh } from "./fresh.js";
import { wavering } from "./wavering.js";
import { lapsing } from "./lapsing.js";
import { lapsed_returning } from "./lapsed-returning.js";
import { free_rider } from "./free-rider.js";

export const personas = [loyal, power, fresh, wavering, lapsing, lapsed_returning, free_rider];
```

- [ ] **Implement ground-truth labeller in `packages/sources/src/synthetic/ground-truth.ts`**

```ts
export type GroundTruthLabel = {
  user_id: string;
  persona: string;
  will_churn: boolean;
  churn_at: string | null; // ISO timestamp if churned
  churn_reason: string | null;
};

// Populated by generate.ts at the same time as events
export const groundTruthForRun = new Map<string, GroundTruthLabel[]>(); // keyed by run seed
```

- [ ] **Implement `generate.ts` — deterministic event stream**

```ts
import seedrandom from "seedrandom";
import { Event, EventKind } from "@rcrb/core";
import { personas } from "./personas/index.js";
import { GroundTruthLabel, groundTruthForRun } from "./ground-truth.js";

export type GenerateOpts = {
  num_users: number;
  days: number;
  seed: string;
  start_date?: Date;
};

export function generate(opts: GenerateOpts): { events: Event[]; ground_truth: GroundTruthLabel[] } {
  const rng = seedrandom(opts.seed);
  const start = opts.start_date ?? new Date(Date.now() - opts.days * 86400_000);
  const events: Event[] = [];
  const ground_truth: GroundTruthLabel[] = [];

  for (let i = 0; i < opts.num_users; i++) {
    // 1. Sample persona by weight
    const persona = sampleByWeight(personas, rng);
    const user_id = `user_${i}`;
    const email = `user${i}@example.test`;

    // 2. Decide churn
    const will_churn = persona.profile.will_churn && rng() < 0.5; // half the eligible churn
    const churn_day = will_churn
      ? Math.max(1, Math.floor(opts.days - (persona.profile.churn_window_days ?? 7) - rng() * 5))
      : null;

    ground_truth.push({
      user_id,
      persona: persona.name,
      will_churn,
      churn_at: churn_day === null ? null : new Date(start.getTime() + churn_day * 86400_000).toISOString(),
      churn_reason: will_churn ? persona.profile.churn_reason : null,
    });

    // 3. Initial purchase event on day 0 (or earlier for existing users)
    events.push({
      id: `evt_${events.length}`,
      user_id,
      kind: "subscription.purchase",
      timestamp: new Date(start.getTime() - 86400_000 * Math.floor(rng() * 60)).toISOString(),
      source: "synthetic",
      payload: { product: "pro_monthly", price: 9.99, currency: "USD", email },
    });

    // 4. Generate per-day events for the user
    for (let d = 0; d < opts.days; d++) {
      // Stop activity after churn
      if (churn_day !== null && d >= churn_day) {
        if (d === churn_day) {
          events.push({
            id: `evt_${events.length}`,
            user_id,
            kind: "subscription.cancel",
            timestamp: new Date(start.getTime() + d * 86400_000).toISOString(),
            source: "synthetic",
            payload: { reason: persona.profile.churn_reason },
          });
        }
        continue;
      }

      // Sessions for the day
      const sessions_today = Math.max(0, Math.round(
        (persona.profile.sessions_per_week.mean / 7) +
        (rng() - 0.5) * persona.profile.sessions_per_week.sd
      ));
      for (let s = 0; s < sessions_today; s++) {
        const ts = new Date(start.getTime() + d * 86400_000 + Math.floor(rng() * 86400_000)).toISOString();
        events.push({
          id: `evt_${events.length}`,
          user_id,
          kind: "usage.session",
          timestamp: ts,
          source: "synthetic",
          payload: { duration_seconds: Math.floor(60 + rng() * 600) },
        });
        const features_this_session = Math.max(0, Math.round(
          persona.profile.feature_events_per_session.mean +
          (rng() - 0.5) * persona.profile.feature_events_per_session.sd
        ));
        for (let f = 0; f < features_this_session; f++) {
          events.push({
            id: `evt_${events.length}`,
            user_id,
            kind: "usage.feature",
            timestamp: ts,
            source: "synthetic",
            payload: { feature: pickFeature(rng) },
          });
        }
      }

      // Crashes
      if (rng() < persona.profile.crash_rate) {
        events.push({
          id: `evt_${events.length}`,
          user_id,
          kind: "error.crash",
          timestamp: new Date(start.getTime() + d * 86400_000).toISOString(),
          source: "synthetic",
          payload: { stack: "synthetic crash" },
        });
      }

      // Support tickets
      if (rng() < persona.profile.support_ticket_rate / 30) { // monthly rate per day
        events.push({
          id: `evt_${events.length}`,
          user_id,
          kind: "support.ticket_open",
          timestamp: new Date(start.getTime() + d * 86400_000).toISOString(),
          source: "synthetic",
          payload: { sentiment: persona.profile.churn_reason === "support_complaint" ? "negative" : "neutral" },
        });
      }

      // Renewal day (every 30 days from purchase)
      if (d % 30 === 29) {
        const failed = rng() < persona.profile.payment_failure_rate;
        events.push({
          id: `evt_${events.length}`,
          user_id,
          kind: failed ? "payment.failure" : "payment.success",
          timestamp: new Date(start.getTime() + d * 86400_000).toISOString(),
          source: "synthetic",
          payload: { amount: 9.99, currency: "USD" },
        });
      }
    }
  }

  groundTruthForRun.set(opts.seed, ground_truth);
  events.sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return { events, ground_truth };
}

function sampleByWeight<T extends { weight: number }>(items: T[], rng: () => number): T {
  const total = items.reduce((s, i) => s + i.weight, 0);
  let r = rng() * total;
  for (const item of items) {
    r -= item.weight;
    if (r <= 0) return item;
  }
  return items[items.length - 1]!;
}

const FEATURES = ["dashboard", "export", "settings", "search", "share", "premium_feature_a", "premium_feature_b"];
function pickFeature(rng: () => number): string {
  return FEATURES[Math.floor(rng() * FEATURES.length)]!;
}
```

- [ ] **Wrap synthetic source as a `Source`**

`packages/sources/src/synthetic/index.ts`:
```ts
import { Source } from "../source.js";
import { Event } from "@rcrb/core";
import { generate, GenerateOpts } from "./generate.js";

export function syntheticSource(opts: GenerateOpts): Source & { ground_truth: ReturnType<typeof generate>["ground_truth"] } {
  const { events, ground_truth } = generate(opts);
  return {
    name: "synthetic",
    ground_truth,
    async *backfill() {
      for (const e of events) yield e;
    },
  };
}

export { generate } from "./generate.js";
export * from "./ground-truth.js";
```

- [ ] **Write tests for the simulator**

`packages/sources/src/synthetic/generate.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { generate } from "./generate.js";

describe("synthetic generate", () => {
  it("is deterministic given the same seed", () => {
    const a = generate({ num_users: 10, days: 7, seed: "test" });
    const b = generate({ num_users: 10, days: 7, seed: "test" });
    expect(a.events.length).toBe(b.events.length);
    expect(a.events[0]).toEqual(b.events[0]);
    expect(a.ground_truth).toEqual(b.ground_truth);
  });

  it("produces events for all users", () => {
    const { events } = generate({ num_users: 50, days: 30, seed: "k1" });
    const ids = new Set(events.map((e) => e.user_id));
    expect(ids.size).toBe(50);
  });

  it("ground truth is consistent — churners stop having events after churn_at", () => {
    const { events, ground_truth } = generate({ num_users: 100, days: 30, seed: "k2" });
    const churners = ground_truth.filter((g) => g.will_churn);
    for (const c of churners.slice(0, 5)) {
      const userEvents = events.filter((e) => e.user_id === c.user_id);
      const lastEvent = userEvents[userEvents.length - 1]!;
      expect(lastEvent.timestamp).toBeLessThanOrEqual(c.churn_at!);
    }
  });

  it("seeded weights produce roughly persona-distribution-correct populations", () => {
    const { ground_truth } = generate({ num_users: 1000, days: 7, seed: "k3" });
    const counts = new Map<string, number>();
    for (const g of ground_truth) counts.set(g.persona, (counts.get(g.persona) ?? 0) + 1);
    expect(counts.get("loyal")! / 1000).toBeCloseTo(0.30, 1);
    expect(counts.get("lapsing")! / 1000).toBeCloseTo(0.10, 1);
  });
});
```

- [ ] **Run tests**

Run: `pnpm test`
Expected: 4 passes for `generate.test.ts`.

- [ ] **Commit Phase 1**

```bash
git add packages/
git commit -m "feat(core,sources): event/intervention types + synthetic source"
```

---

## Phase 2: Risk Engine

**Goal:** Per-user risk score in [0,1] with top contributing signals + 1-sentence narrative. Hybrid: heuristic signals + LLM judge over user timeline.

**Quality bar:** ≥75% precision @ 50% recall on synthetic ground truth (1000 users, 30 days).

**Files:**
- Create: `packages/risk-engine/package.json`, `tsconfig.json`
- Create: `packages/risk-engine/src/index.ts`
- Create: `packages/risk-engine/src/score.ts`
- Create: `packages/risk-engine/src/signals/{usage-decline,payment-health,support-sentiment,lifecycle-stage,engagement-recency,error-rate}.ts`
- Create: `packages/risk-engine/src/signals/index.ts`
- Create: `packages/risk-engine/src/llm-judge.ts`
- Test: `packages/risk-engine/src/score.test.ts`

### Tasks

- [ ] **Scaffold `packages/risk-engine`**

`packages/risk-engine/package.json`:
```json
{
  "name": "@rcrb/risk-engine",
  "version": "0.0.1",
  "type": "module",
  "main": "./src/index.ts",
  "exports": { ".": "./src/index.ts" },
  "scripts": { "build": "tsc -b" },
  "dependencies": {
    "@rcrb/core": "workspace:*",
    "@anthropic-ai/sdk": "^0.40.0",
    "ai": "^5.0.0",
    "@ai-sdk/anthropic": "^2.0.0",
    "zod": "^3.23.0"
  }
}
```

`packages/risk-engine/tsconfig.json`: same shape as `sources/`, references `../core`.

- [ ] **Implement individual signals**

Each signal is a pure function `(timeline: UserTimeline) => Signal`. Signals output:

```ts
export type Signal = {
  name: string;
  score: number;          // [0,1] where 1 = high risk
  weight: number;         // contribution to combined score
  reason: string;         // 1-sentence why
};
```

Six signals with concrete logic (no placeholders):

**`usage-decline.ts`** — compare last-7-day session count to days-8-to-30 baseline. If recent < 50% of baseline → high score. Implementation:

```ts
import { UserTimeline } from "@rcrb/core";
import { Signal } from "./types.js";

export function usageDecline(timeline: UserTimeline): Signal {
  const now = new Date(timeline.events.at(-1)?.timestamp ?? Date.now());
  const day7 = new Date(now.getTime() - 7 * 86400_000);
  const day30 = new Date(now.getTime() - 30 * 86400_000);
  const sessions = timeline.events.filter((e) => e.kind === "usage.session");
  const recent = sessions.filter((e) => new Date(e.timestamp) >= day7).length;
  const baseline = sessions.filter((e) => {
    const t = new Date(e.timestamp);
    return t >= day30 && t < day7;
  }).length;
  const baseDaily = baseline / 23;
  const recentDaily = recent / 7;
  if (baseDaily < 0.1) return { name: "usage_decline", score: 0, weight: 0.3, reason: "insufficient baseline" };
  const ratio = recentDaily / baseDaily;
  const score = Math.max(0, Math.min(1, 1 - ratio));
  return {
    name: "usage_decline",
    score,
    weight: 0.30,
    reason: `last-7d sessions ${ratio < 1 ? "down" : "up"} ${Math.round(Math.abs(1 - ratio) * 100)}% vs baseline`,
  };
}
```

**`payment-health.ts`** — most recent payment event in last 14 days; if failure with no subsequent success → high. Otherwise low.
```ts
import { UserTimeline } from "@rcrb/core";
import { Signal } from "./types.js";

export function paymentHealth(timeline: UserTimeline): Signal {
  const now = new Date(timeline.events.at(-1)?.timestamp ?? Date.now());
  const cutoff = new Date(now.getTime() - 14 * 86400_000);
  const payments = timeline.events.filter(
    (e) => e.kind === "payment.failure" || e.kind === "payment.success"
  ).filter((e) => new Date(e.timestamp) >= cutoff);
  if (payments.length === 0) return { name: "payment_health", score: 0, weight: 0.20, reason: "no recent payment events" };
  const last = payments.at(-1)!;
  if (last.kind === "payment.failure") {
    return { name: "payment_health", score: 0.9, weight: 0.20, reason: "most recent payment failed, no recovery" };
  }
  return { name: "payment_health", score: 0, weight: 0.20, reason: "payments healthy" };
}
```

**`support-sentiment.ts`** — count negative tickets in last 14 days; >0 = high.
```ts
import { UserTimeline } from "@rcrb/core";
import { Signal } from "./types.js";

export function supportSentiment(timeline: UserTimeline): Signal {
  const now = new Date(timeline.events.at(-1)?.timestamp ?? Date.now());
  const cutoff = new Date(now.getTime() - 14 * 86400_000);
  const tickets = timeline.events.filter(
    (e) => e.kind === "support.ticket_open" && new Date(e.timestamp) >= cutoff
  );
  const negative = tickets.filter((e) => (e.payload as { sentiment?: string }).sentiment === "negative");
  if (tickets.length === 0) return { name: "support_sentiment", score: 0, weight: 0.15, reason: "no recent tickets" };
  const score = Math.min(1, negative.length / Math.max(1, tickets.length));
  return {
    name: "support_sentiment",
    score,
    weight: 0.15,
    reason: `${negative.length}/${tickets.length} recent tickets negative`,
  };
}
```

**`lifecycle-stage.ts`** — first-30-days = lower risk threshold (new users wobble); >365 days = stable; in-between = higher weight.
```ts
import { UserTimeline } from "@rcrb/core";
import { Signal } from "./types.js";

export function lifecycleStage(timeline: UserTimeline): Signal {
  const purchase = timeline.events.find((e) => e.kind === "subscription.purchase");
  if (!purchase) return { name: "lifecycle_stage", score: 0, weight: 0.10, reason: "no purchase event" };
  const days = (Date.now() - new Date(purchase.timestamp).getTime()) / 86400_000;
  if (days < 30) return { name: "lifecycle_stage", score: 0.3, weight: 0.10, reason: "new user (<30d)" };
  if (days < 90) return { name: "lifecycle_stage", score: 0.5, weight: 0.10, reason: "early user (30-90d)" };
  if (days < 365) return { name: "lifecycle_stage", score: 0.4, weight: 0.10, reason: "established (90d-1y)" };
  return { name: "lifecycle_stage", score: 0.2, weight: 0.10, reason: "long-tenure (>1y)" };
}
```

**`engagement-recency.ts`** — days since last session; >7 = elevated; >14 = high.
```ts
import { UserTimeline } from "@rcrb/core";
import { Signal } from "./types.js";

export function engagementRecency(timeline: UserTimeline): Signal {
  const now = new Date(timeline.events.at(-1)?.timestamp ?? Date.now());
  const sessions = timeline.events.filter((e) => e.kind === "usage.session");
  if (sessions.length === 0) return { name: "engagement_recency", score: 0.7, weight: 0.15, reason: "no sessions ever" };
  const last = new Date(sessions.at(-1)!.timestamp);
  const days = (now.getTime() - last.getTime()) / 86400_000;
  let score = 0;
  if (days > 14) score = 0.9;
  else if (days > 7) score = 0.6;
  else if (days > 3) score = 0.3;
  return {
    name: "engagement_recency",
    score,
    weight: 0.15,
    reason: `last session ${Math.round(days)}d ago`,
  };
}
```

**`error-rate.ts`** — crash count in last 14 days; >2 = elevated; >5 = high.
```ts
import { UserTimeline } from "@rcrb/core";
import { Signal } from "./types.js";

export function errorRate(timeline: UserTimeline): Signal {
  const now = new Date(timeline.events.at(-1)?.timestamp ?? Date.now());
  const cutoff = new Date(now.getTime() - 14 * 86400_000);
  const crashes = timeline.events.filter(
    (e) => e.kind === "error.crash" && new Date(e.timestamp) >= cutoff
  ).length;
  let score = 0;
  if (crashes > 5) score = 0.85;
  else if (crashes > 2) score = 0.55;
  else if (crashes > 0) score = 0.25;
  return {
    name: "error_rate",
    score,
    weight: 0.10,
    reason: `${crashes} crash(es) in last 14d`,
  };
}
```

`packages/risk-engine/src/signals/types.ts`:
```ts
export type Signal = { name: string; score: number; weight: number; reason: string };
```

`packages/risk-engine/src/signals/index.ts`:
```ts
export { usageDecline } from "./usage-decline.js";
export { paymentHealth } from "./payment-health.js";
export { supportSentiment } from "./support-sentiment.js";
export { lifecycleStage } from "./lifecycle-stage.js";
export { engagementRecency } from "./engagement-recency.js";
export { errorRate } from "./error-rate.js";
export type { Signal } from "./types.js";
```

- [ ] **Implement LLM judge in `llm-judge.ts`**

```ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { UserTimeline } from "@rcrb/core";

const JudgeSchema = z.object({
  narrative_risk: z.number().min(0).max(1),
  reason: z.string().max(280),
});

export async function llmJudge(timeline: UserTimeline): Promise<{ score: number; reason: string }> {
  // Compact timeline to last 30 events (or 30 days, whichever smaller)
  const recent = timeline.events.slice(-30);
  const summary = recent.map((e) => `${e.timestamp} ${e.kind} ${JSON.stringify(e.payload).slice(0, 80)}`).join("\n");

  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: JudgeSchema,
    prompt: `You are a churn-risk analyst. Read the recent event history of a subscription user and judge their narrative churn risk.

Score 0 = clearly engaged and likely to renew.
Score 1 = clearly disengaged, frustrated, or showing strong cancel signals.

Be calibrated, not dramatic. Most users are not at risk.

User: ${timeline.user_id}
Recent events:
${summary}

Output a single JSON object with narrative_risk (0–1) and a one-sentence reason.`,
  });
  return { score: object.narrative_risk, reason: object.reason };
}
```

- [ ] **Implement combined `score.ts`**

```ts
import { UserTimeline } from "@rcrb/core";
import * as S from "./signals/index.js";
import { llmJudge } from "./llm-judge.js";

export type RiskScore = {
  user_id: string;
  score: number;             // [0,1]
  top_signals: S.Signal[];   // top 3 contributing
  narrative: string;         // LLM judge sentence
};

const LLM_WEIGHT = 0.20;

export async function scoreUser(timeline: UserTimeline, opts: { useLLM: boolean } = { useLLM: true }): Promise<RiskScore> {
  const signals: S.Signal[] = [
    S.usageDecline(timeline),
    S.paymentHealth(timeline),
    S.supportSentiment(timeline),
    S.lifecycleStage(timeline),
    S.engagementRecency(timeline),
    S.errorRate(timeline),
  ];
  const heuristicScore = signals.reduce((s, sig) => s + sig.score * sig.weight, 0);
  let llm: { score: number; reason: string } = { score: 0, reason: "(LLM disabled)" };
  if (opts.useLLM) {
    try {
      llm = await llmJudge(timeline);
    } catch (err) {
      llm = { score: 0, reason: `LLM unavailable: ${err instanceof Error ? err.message : "unknown"}` };
    }
  }
  const combined = heuristicScore * (1 - LLM_WEIGHT) + llm.score * LLM_WEIGHT;
  const top_signals = [...signals].sort((a, b) => b.score * b.weight - a.score * a.weight).slice(0, 3);
  return {
    user_id: timeline.user_id,
    score: Math.max(0, Math.min(1, combined)),
    top_signals,
    narrative: llm.reason,
  };
}

export async function scoreAll(
  timelines: UserTimeline[],
  opts: { useLLM: boolean } = { useLLM: true }
): Promise<RiskScore[]> {
  // Run with concurrency limit of 5 to avoid LLM rate limits
  const out: RiskScore[] = [];
  for (let i = 0; i < timelines.length; i += 5) {
    const batch = timelines.slice(i, i + 5);
    const results = await Promise.all(batch.map((t) => scoreUser(t, opts)));
    out.push(...results);
  }
  return out;
}
```

`packages/risk-engine/src/index.ts`:
```ts
export * from "./score.js";
export * as signals from "./signals/index.js";
export { llmJudge } from "./llm-judge.js";
```

- [ ] **Write tests**

`packages/risk-engine/src/score.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { syntheticSource } from "@rcrb/sources/synthetic";
import { buildTimelines } from "@rcrb/core";
import { scoreAll } from "./index.js";

describe("risk engine — heuristic only (no LLM)", () => {
  it("flags lapsing users at higher risk than loyal", async () => {
    const src = syntheticSource({ num_users: 200, days: 30, seed: "risk-test" });
    const events: any[] = [];
    for await (const e of src.backfill({ since: new Date(0), until: new Date() })) events.push(e);
    const timelines = buildTimelines(events);
    const scores = await scoreAll(timelines, { useLLM: false });
    const byUser = new Map(scores.map((s) => [s.user_id, s]));

    const lapsing = src.ground_truth.filter((g) => g.persona === "lapsing").map((g) => byUser.get(g.user_id)!.score);
    const loyal = src.ground_truth.filter((g) => g.persona === "loyal").map((g) => byUser.get(g.user_id)!.score);

    const lapsingMean = lapsing.reduce((s, x) => s + x, 0) / lapsing.length;
    const loyalMean = loyal.reduce((s, x) => s + x, 0) / loyal.length;
    expect(lapsingMean).toBeGreaterThan(loyalMean + 0.2);
  });

  it("achieves ≥75% precision @ 50% recall on synthetic churners", async () => {
    const src = syntheticSource({ num_users: 1000, days: 30, seed: "precision-test" });
    const events: any[] = [];
    for await (const e of src.backfill({ since: new Date(0), until: new Date() })) events.push(e);
    const timelines = buildTimelines(events);
    const scores = await scoreAll(timelines, { useLLM: false });
    const byUser = new Map(scores.map((s) => [s.user_id, s]));

    // Threshold at the score that captures top 50% recall on actual churners
    const churners = src.ground_truth.filter((g) => g.will_churn);
    const churnerScores = churners.map((g) => byUser.get(g.user_id)!.score).sort((a, b) => b - a);
    const threshold = churnerScores[Math.floor(churners.length * 0.5)]!;
    const flagged = scores.filter((s) => s.score >= threshold);
    const churnerSet = new Set(churners.map((g) => g.user_id));
    const truePositives = flagged.filter((s) => churnerSet.has(s.user_id)).length;
    const precision = truePositives / flagged.length;
    expect(precision).toBeGreaterThanOrEqual(0.75);
  });
});
```

- [ ] **Run tests**

Run: `pnpm test risk-engine`
Expected: 2 passes. If precision test fails, tune signal weights in `score.ts` and re-run. (Common adjustments: bump `usage_decline` to 0.35, `engagement_recency` to 0.20.)

- [ ] **Commit Phase 2**

```bash
git add packages/risk-engine
git commit -m "feat(risk-engine): heuristic signals + LLM judge + combined score"
```

---

## Phase 3: Intervention Agent

**Goal:** Per at-risk user, output a structured `Intervention` (channel, offer, timing, copy, reasoning, predicted_lift). Sub-agent pipeline: channel → offer → timing → copy → critic.

**Quality bar:** LLM-judge avg ≥4/5 across 4 dimensions (relevance, personalization, tone, plausibility).

**Files:**
- Create: `packages/intervention-agent/package.json`, `tsconfig.json`
- Create: `packages/intervention-agent/src/index.ts`
- Create: `packages/intervention-agent/src/decide-channel.ts`
- Create: `packages/intervention-agent/src/decide-offer.ts`
- Create: `packages/intervention-agent/src/decide-timing.ts`
- Create: `packages/intervention-agent/src/compose.ts`
- Create: `packages/intervention-agent/src/critic.ts`
- Create: `packages/intervention-agent/src/run.ts`
- Test: `packages/intervention-agent/src/run.test.ts`

### Tasks

- [ ] **Scaffold package** (same shape as Phase 2)

Dependencies: `@rcrb/core`, `@rcrb/risk-engine`, `ai`, `@ai-sdk/anthropic`, `zod`.

- [ ] **Implement `decide-channel.ts`** — single LLM call, structured output

```ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { Channel, RiskScore, UserTimeline } from "@rcrb/core";
// (Note: Channel exported from @rcrb/core via intervention.ts)

const Schema = z.object({
  channel: z.enum(["email", "push", "in_app", "dunning_fix", "no_op"]),
  reason: z.string().max(140),
});

export async function decideChannel(risk: RiskScore, timeline: UserTimeline): Promise<{ channel: z.infer<typeof Schema>["channel"]; reason: string }> {
  const topReasons = risk.top_signals.map((s) => `- ${s.name}: ${s.reason}`).join("\n");
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: Schema,
    prompt: `Decide the best channel for a retention intervention.

User ${risk.user_id} risk score: ${risk.score.toFixed(2)}
Top signals:
${topReasons}
Narrative: ${risk.narrative}

Channels:
- email: best for explanations, longer messages, confirmations
- push: brief nudge, only if user has been engaged recently
- in_app: only if user is currently active (sessions in last 3d)
- dunning_fix: only if primary signal is payment_health
- no_op: if risk is low or signals are too weak/noisy

Pick exactly one. Keep reason ≤140 chars.`,
  });
  return object;
}
```

- [ ] **Implement `decide-offer.ts`**

```ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { OfferKind, RiskScore } from "@rcrb/core";

const Schema = z.object({
  kind: z.enum(["discount_percent", "discount_amount", "extension_days", "upgrade_incentive", "feature_unlock", "none"]),
  value: z.number().optional(),
  reason: z.string().max(140),
});

export async function decideOffer(risk: RiskScore, channel: string): Promise<{ kind: z.infer<typeof Schema>["kind"]; value?: number; reason: string }> {
  const topReasons = risk.top_signals.map((s) => `- ${s.name}: ${s.reason}`).join("\n");
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: Schema,
    prompt: `Decide what (if any) offer to attach to a retention intervention.

User risk score: ${risk.score.toFixed(2)}
Channel: ${channel}
Signals:
${topReasons}

Guardrails:
- discount_percent: 10–25 typical; only for usage_decline or post-trial
- extension_days: 7–30 typical; best for payment_health failures
- upgrade_incentive: only for power users showing volume frustration
- feature_unlock: time-limited free pro features
- none: if user just needs reassurance/help, not a bribe

Pick exactly one offer kind. Be calibrated — not every at-risk user needs a discount.`,
  });
  return object;
}
```

- [ ] **Implement `decide-timing.ts`**

```ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { RiskScore } from "@rcrb/core";

const Schema = z.object({
  timing: z.enum(["immediate", "next_session", "within_24h", "before_renewal"]),
  reason: z.string().max(140),
});

export async function decideTiming(risk: RiskScore, channel: string): Promise<z.infer<typeof Schema>> {
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: Schema,
    prompt: `Decide when to send the intervention.

Risk: ${risk.score.toFixed(2)}, top signal: ${risk.top_signals[0]?.name}
Channel: ${channel}

Options:
- immediate: send right now
- next_session: wait until user opens the app again (in_app or push only)
- within_24h: schedule for a high-engagement time window
- before_renewal: align with the subscription renewal date

Pick one.`,
  });
  return object;
}
```

- [ ] **Implement `compose.ts`** — generates subject + body

```ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { RiskScore } from "@rcrb/core";

const Schema = z.object({
  subject: z.string().max(80).optional(),
  body: z.string().max(800),
});

export async function compose(opts: {
  risk: RiskScore;
  channel: string;
  offer: { kind: string; value?: number };
  user_email?: string;
}): Promise<z.infer<typeof Schema>> {
  const offerLine = opts.offer.kind === "none" ? "no offer attached" : `${opts.offer.kind}=${opts.offer.value ?? "(default)"}`;
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: Schema,
    prompt: `Write a personalized retention message.

User ${opts.risk.user_id}, risk ${opts.risk.score.toFixed(2)}
Channel: ${opts.channel}
Offer: ${offerLine}
Why they're at risk: ${opts.risk.narrative}
Top signal: ${opts.risk.top_signals[0]?.reason}

Style:
- Warm, specific, not desperate
- Mention the actual signal (e.g., "we noticed you haven't logged in for a week")
- If offer is "none", focus on understanding/help/value reminder
- ${opts.channel === "push" ? "Push: ≤80 chars body, no subject" : "Subject: short, specific, no clickbait"}
- No emojis unless absolutely natural

Output just subject (if applicable) and body.`,
  });
  return object;
}
```

- [ ] **Implement `critic.ts`**

```ts
import { generateObject } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { Intervention } from "@rcrb/core";

const CriticSchema = z.object({
  scores: z.object({
    relevance: z.number().min(1).max(5),
    personalization: z.number().min(1).max(5),
    tone: z.number().min(1).max(5),
    plausibility: z.number().min(1).max(5),
  }),
  notes: z.string().max(280),
  recommendation: z.enum(["accept", "revise", "reject"]),
});

export async function critique(intervention: Intervention): Promise<z.infer<typeof CriticSchema>> {
  const { object } = await generateObject({
    model: anthropic("claude-sonnet-4-6"),
    schema: CriticSchema,
    prompt: `Score this retention intervention 1-5 across four dimensions.

Intervention:
${JSON.stringify(intervention, null, 2)}

Rubric:
- relevance: does the play match the actual risk signals?
- personalization: does the copy reflect this user specifically, not a template?
- tone: warm, specific, not desperate or pushy?
- plausibility: would a thoughtful PM actually send this?

Recommendation: accept (≥4 avg), revise (3-3.99), reject (<3).`,
  });
  return object;
}
```

- [ ] **Implement `run.ts`** — orchestrate the full pipeline

```ts
import { Intervention, RiskScore, UserTimeline } from "@rcrb/core";
import { decideChannel } from "./decide-channel.js";
import { decideOffer } from "./decide-offer.js";
import { decideTiming } from "./decide-timing.js";
import { compose } from "./compose.js";
import { critique } from "./critic.js";

export async function generateIntervention(risk: RiskScore, timeline: UserTimeline): Promise<Intervention | null> {
  const ch = await decideChannel(risk, timeline);
  if (ch.channel === "no_op") return null;
  const off = await decideOffer(risk, ch.channel);
  const tim = await decideTiming(risk, ch.channel);
  const cop = await compose({ risk, channel: ch.channel, offer: off });
  const intervention: Intervention = {
    user_id: risk.user_id,
    risk_score: risk.score,
    channel: ch.channel,
    offer: { kind: off.kind, value: off.value },
    timing: tim.timing,
    copy: { subject: cop.subject, body: cop.body },
    reasoning: `${ch.reason} ${off.reason} ${tim.reason}`.trim(),
    predicted_lift: { direction: "positive", confidence: "low", note: "directional only — no historical baseline" },
  };
  // Critic pass — log but don't block (drift is allowed; visibility matters)
  const c = await critique(intervention);
  return intervention;
}

export async function generateAll(
  risks: RiskScore[],
  timelinesByUser: Map<string, UserTimeline>,
  opts: { threshold: number; max?: number }
): Promise<Intervention[]> {
  const candidates = risks.filter((r) => r.score >= opts.threshold);
  const sliced = opts.max ? candidates.slice(0, opts.max) : candidates;
  const out: Intervention[] = [];
  // Sequential to keep LLM cost predictable
  for (const r of sliced) {
    const tl = timelinesByUser.get(r.user_id);
    if (!tl) continue;
    const inter = await generateIntervention(r, tl);
    if (inter) out.push(inter);
  }
  return out;
}
```

- [ ] **Smoke test**

`packages/intervention-agent/src/run.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { syntheticSource } from "@rcrb/sources/synthetic";
import { buildTimelines } from "@rcrb/core";
import { scoreAll } from "@rcrb/risk-engine";
import { generateAll } from "./run.js";

// Skip if no API key set — this is an integration test
const HAS_KEY = Boolean(process.env.ANTHROPIC_API_KEY);

describe.skipIf(!HAS_KEY)("intervention agent (live LLM)", () => {
  it("generates plausible interventions for top-5 at-risk synthetic users", async () => {
    const src = syntheticSource({ num_users: 100, days: 30, seed: "intv-smoke" });
    const events: any[] = [];
    for await (const e of src.backfill({ since: new Date(0), until: new Date() })) events.push(e);
    const timelines = buildTimelines(events);
    const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));
    const risks = await scoreAll(timelines, { useLLM: false });
    const interventions = await generateAll(risks, tlByUser, { threshold: 0.5, max: 5 });

    expect(interventions.length).toBeGreaterThan(0);
    for (const i of interventions) {
      expect(i.copy.body.length).toBeGreaterThan(20);
      expect(i.channel).not.toBe("no_op");
    }
  }, 60_000);
});
```

- [ ] **Run tests** (with `ANTHROPIC_API_KEY` set)

Run: `pnpm test intervention-agent`
Expected: skipped if no key; passes if key set.

- [ ] **Commit Phase 3**

```bash
git add packages/intervention-agent
git commit -m "feat(intervention-agent): sub-agent pipeline (channel/offer/timing/copy + critic)"
```

---

## Phase 4: Eval harness

**Goal:** Two evals — risk prediction (precision/recall vs ground truth) and intervention quality (LLM-as-judge per the rubric). Markdown report. Deterministic from seed. CI runs them on every PR.

**Files:**
- Create: `packages/eval/package.json`, `tsconfig.json`
- Create: `packages/eval/src/index.ts`
- Create: `packages/eval/src/prediction.ts`
- Create: `packages/eval/src/intervention.ts`
- Create: `packages/eval/src/report.ts`
- Create: `packages/eval/src/rubric.md`
- Create: `packages/eval/src/run.ts`
- Test: `packages/eval/src/prediction.test.ts`

### Tasks

- [ ] **Scaffold package** with deps `@rcrb/core`, `@rcrb/sources`, `@rcrb/risk-engine`, `@rcrb/intervention-agent`.

- [ ] **Write `rubric.md`** (versioned, reviewable):

```markdown
# Intervention Eval Rubric (v1)

Each dimension scored 1–5.

## Relevance (does the play match the actual risk signals?)
- 5: directly addresses the dominant signal (e.g., usage decline → re-engagement message; payment fail → dunning fix)
- 3: addresses a real signal but not the dominant one
- 1: ignores the signals entirely; generic retention spam

## Personalization (does the copy reflect this user specifically?)
- 5: references actual behavior or context from the timeline
- 3: feels persona-tuned but could fit many users
- 1: pure template; mail-merge-ready

## Tone (warm, specific, not desperate or pushy?)
- 5: feels like a thoughtful human wrote it
- 3: professional but bland
- 1: pushy, guilt-trippy, or condescending

## Plausibility (would a thoughtful PM send this?)
- 5: yes, would A/B test
- 3: needs minor edits
- 1: would never ship

## Aggregate
- accept: avg ≥ 4
- revise: 3 ≤ avg < 4
- reject: avg < 3
```

- [ ] **Implement `prediction.ts`**

```ts
import { GroundTruthLabel } from "@rcrb/sources/synthetic";
import { RiskScore } from "@rcrb/risk-engine";

export type PredictionEval = {
  threshold: number;
  precision: number;
  recall: number;
  f1: number;
  by_persona: Record<string, { count: number; avg_score: number; recall_at_threshold: number }>;
};

export function evalPredictions(scores: RiskScore[], gt: GroundTruthLabel[], threshold = 0.5): PredictionEval {
  const churnerSet = new Set(gt.filter((g) => g.will_churn).map((g) => g.user_id));
  const flagged = scores.filter((s) => s.score >= threshold);
  const tp = flagged.filter((s) => churnerSet.has(s.user_id)).length;
  const fp = flagged.length - tp;
  const fn = churnerSet.size - tp;
  const precision = tp / Math.max(1, tp + fp);
  const recall = tp / Math.max(1, tp + fn);
  const f1 = 2 * (precision * recall) / Math.max(0.0001, precision + recall);

  const byUser = new Map(scores.map((s) => [s.user_id, s]));
  const by_persona: PredictionEval["by_persona"] = {};
  for (const g of gt) {
    const stats = (by_persona[g.persona] ??= { count: 0, avg_score: 0, recall_at_threshold: 0 });
    stats.count += 1;
    stats.avg_score += byUser.get(g.user_id)?.score ?? 0;
    if (g.will_churn && (byUser.get(g.user_id)?.score ?? 0) >= threshold) {
      stats.recall_at_threshold += 1;
    }
  }
  for (const k of Object.keys(by_persona)) {
    const s = by_persona[k]!;
    s.avg_score = s.avg_score / s.count;
    s.recall_at_threshold = s.recall_at_threshold / Math.max(1, s.count);
  }
  return { threshold, precision, recall, f1, by_persona };
}
```

- [ ] **Implement `intervention.ts`** — LLM-as-judge per rubric

```ts
import { Intervention } from "@rcrb/core";
import { critique } from "@rcrb/intervention-agent/dist/critic.js";

export type InterventionEval = {
  count: number;
  avg: { relevance: number; personalization: number; tone: number; plausibility: number; aggregate: number };
  accept_rate: number;
};

export async function evalInterventions(interventions: Intervention[]): Promise<InterventionEval> {
  const judgments = await Promise.all(interventions.map((i) => critique(i)));
  const sum = { relevance: 0, personalization: 0, tone: 0, plausibility: 0 };
  let accepts = 0;
  for (const j of judgments) {
    sum.relevance += j.scores.relevance;
    sum.personalization += j.scores.personalization;
    sum.tone += j.scores.tone;
    sum.plausibility += j.scores.plausibility;
    if (j.recommendation === "accept") accepts += 1;
  }
  const n = Math.max(1, interventions.length);
  const avg = {
    relevance: sum.relevance / n,
    personalization: sum.personalization / n,
    tone: sum.tone / n,
    plausibility: sum.plausibility / n,
    aggregate: (sum.relevance + sum.personalization + sum.tone + sum.plausibility) / (4 * n),
  };
  return { count: interventions.length, avg, accept_rate: accepts / n };
}
```

- [ ] **Implement `report.ts`** — markdown report

```ts
import { PredictionEval } from "./prediction.js";
import { InterventionEval } from "./intervention.js";

export function renderReport(opts: {
  seed: string;
  num_users: number;
  days: number;
  prediction: PredictionEval;
  intervention?: InterventionEval;
}): string {
  const p = opts.prediction;
  const lines: string[] = [];
  lines.push(`# Eval Report — seed=${opts.seed}, ${opts.num_users} users, ${opts.days}d`);
  lines.push(``);
  lines.push(`## Prediction`);
  lines.push(`- threshold: ${p.threshold}`);
  lines.push(`- precision: ${p.precision.toFixed(3)}`);
  lines.push(`- recall: ${p.recall.toFixed(3)}`);
  lines.push(`- F1: ${p.f1.toFixed(3)}`);
  lines.push(``);
  lines.push(`### By persona`);
  lines.push(`| persona | count | avg score | recall@thr |`);
  lines.push(`|---|---|---|---|`);
  for (const [name, s] of Object.entries(p.by_persona)) {
    lines.push(`| ${name} | ${s.count} | ${s.avg_score.toFixed(3)} | ${s.recall_at_threshold.toFixed(3)} |`);
  }
  if (opts.intervention) {
    const i = opts.intervention;
    lines.push(``);
    lines.push(`## Intervention`);
    lines.push(`- count: ${i.count}`);
    lines.push(`- relevance: ${i.avg.relevance.toFixed(2)}`);
    lines.push(`- personalization: ${i.avg.personalization.toFixed(2)}`);
    lines.push(`- tone: ${i.avg.tone.toFixed(2)}`);
    lines.push(`- plausibility: ${i.avg.plausibility.toFixed(2)}`);
    lines.push(`- aggregate: ${i.avg.aggregate.toFixed(2)}`);
    lines.push(`- accept_rate: ${(i.accept_rate * 100).toFixed(1)}%`);
  }
  return lines.join("\n");
}
```

- [ ] **Implement `run.ts`** — top-level eval runner

```ts
import { syntheticSource } from "@rcrb/sources/synthetic";
import { buildTimelines } from "@rcrb/core";
import { scoreAll } from "@rcrb/risk-engine";
import { generateAll } from "@rcrb/intervention-agent";
import { evalPredictions } from "./prediction.js";
import { evalInterventions } from "./intervention.js";
import { renderReport } from "./report.js";

export async function runFullEval(opts: {
  seed: string;
  num_users: number;
  days: number;
  threshold: number;
  withInterventions: boolean;
  withLLMJudge: boolean;
}): Promise<string> {
  const src = syntheticSource({ num_users: opts.num_users, days: opts.days, seed: opts.seed });
  const events: any[] = [];
  for await (const e of src.backfill({ since: new Date(0), until: new Date() })) events.push(e);
  const timelines = buildTimelines(events);
  const scores = await scoreAll(timelines, { useLLM: opts.withLLMJudge });
  const prediction = evalPredictions(scores, src.ground_truth, opts.threshold);
  let intervention: any;
  if (opts.withInterventions) {
    const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));
    const interventions = await generateAll(scores, tlByUser, { threshold: opts.threshold, max: 20 });
    intervention = await evalInterventions(interventions);
  }
  return renderReport({ ...opts, prediction, intervention });
}
```

- [ ] **Tests**

`packages/eval/src/prediction.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { syntheticSource } from "@rcrb/sources/synthetic";
import { buildTimelines } from "@rcrb/core";
import { scoreAll } from "@rcrb/risk-engine";
import { evalPredictions } from "./prediction.js";

describe("eval — prediction", () => {
  it("reports precision/recall on synthetic", async () => {
    const src = syntheticSource({ num_users: 500, days: 30, seed: "eval-pred" });
    const events: any[] = [];
    for await (const e of src.backfill({ since: new Date(0), until: new Date() })) events.push(e);
    const timelines = buildTimelines(events);
    const scores = await scoreAll(timelines, { useLLM: false });
    const e = evalPredictions(scores, src.ground_truth, 0.5);
    expect(e.precision).toBeGreaterThanOrEqual(0.5);
    expect(e.recall).toBeGreaterThanOrEqual(0.3);
    expect(Object.keys(e.by_persona).length).toBeGreaterThanOrEqual(7);
  });
});
```

- [ ] **Run tests**

Run: `pnpm test eval`
Expected: 1 pass.

- [ ] **Commit Phase 4**

```bash
git add packages/eval
git commit -m "feat(eval): prediction + intervention evals + markdown report"
```

---

## Phase 5: CLI + `demo` command

**Goal:** `npx rc-retention-brain demo` runs end-to-end on synthetic data and prints the demo flow described in `SPEC.md`.

**Files:**
- Create: `packages/cli/package.json`, `tsconfig.json`
- Create: `packages/cli/src/index.ts`
- Create: `packages/cli/src/commands/demo.ts`
- Create: `packages/cli/src/commands/eval.ts`
- Create: `packages/cli/src/output.ts`

### Tasks

- [ ] **Scaffold package**

`packages/cli/package.json`:
```json
{
  "name": "rc-retention-brain",
  "version": "0.0.1",
  "type": "module",
  "bin": { "rc-retention-brain": "./src/index.ts" },
  "scripts": { "build": "tsc -b" },
  "dependencies": {
    "@rcrb/core": "workspace:*",
    "@rcrb/sources": "workspace:*",
    "@rcrb/risk-engine": "workspace:*",
    "@rcrb/intervention-agent": "workspace:*",
    "@rcrb/eval": "workspace:*",
    "commander": "^12.1.0",
    "kleur": "^4.1.5",
    "tsx": "^4.19.0"
  }
}
```

- [ ] **Write `cli/src/index.ts`** — commander entrypoint

```ts
#!/usr/bin/env node
import { Command } from "commander";
import { runDemo } from "./commands/demo.js";
import { runEval } from "./commands/eval.js";

const program = new Command();
program.name("rc-retention-brain").description("Per-user, cross-source retention agent").version("0.0.1");
program.command("demo").description("Run synthetic-data demo").option("--users <n>", "user count", "100").option("--days <n>", "days", "30").option("--seed <s>", "seed", "demo").action(runDemo);
program.command("eval").description("Run eval suite").option("--seed <s>", "seed", "eval-default").option("--users <n>", "n", "500").option("--days <n>", "n", "30").option("--with-interventions", "include intervention eval (slower)").option("--with-llm-judge", "use LLM judge in risk").action(runEval);
program.parse();
```

- [ ] **Write `commands/demo.ts`** matching the SPEC's demo output

```ts
import kleur from "kleur";
import { syntheticSource } from "@rcrb/sources/synthetic";
import { buildTimelines } from "@rcrb/core";
import { scoreAll } from "@rcrb/risk-engine";
import { generateAll } from "@rcrb/intervention-agent";
import { evalPredictions } from "@rcrb/eval/dist/prediction.js";

export async function runDemo(opts: { users: string; days: string; seed: string }) {
  const num_users = parseInt(opts.users, 10);
  const days = parseInt(opts.days, 10);
  console.log(kleur.cyan().bold(`🧠 Loading synthetic stream: ${num_users} users, ${days} days of events`));

  const src = syntheticSource({ num_users, days, seed: opts.seed });
  const events: any[] = [];
  for await (const e of src.backfill({ since: new Date(0), until: new Date() })) events.push(e);
  const timelines = buildTimelines(events);

  console.log(kleur.cyan(`📊 Risk Engine: scoring ${timelines.length} users...`));
  const scores = await scoreAll(timelines, { useLLM: false });
  const flagged = scores.filter((s) => s.score >= 0.5).sort((a, b) => b.score - a.score);
  console.log(`   • ${kleur.yellow(flagged.length)} users flagged at risk (>0.50)`);
  const sigCounts = new Map<string, number>();
  for (const s of flagged) for (const sig of s.top_signals.slice(0, 1)) sigCounts.set(sig.name, (sigCounts.get(sig.name) ?? 0) + 1);
  console.log(`   • Top signals: ${[...sigCounts.entries()].map(([k, v]) => `${k} (${v})`).join(", ")}`);

  if (process.env.ANTHROPIC_API_KEY) {
    console.log(kleur.cyan(`🤖 Intervention Agent: generating plays for top 5...`));
    const tlByUser = new Map(timelines.map((t) => [t.user_id, t]));
    const inters = await generateAll(scores, tlByUser, { threshold: 0.5, max: 5 });
    for (const i of inters) {
      console.log(``);
      console.log(`User ${kleur.bold(i.user_id)} (risk ${i.risk_score.toFixed(2)})`);
      console.log(`  Why: ${i.reasoning}`);
      console.log(`  Play: ${i.channel} · ${i.offer.kind}${i.offer.value ? `=${i.offer.value}` : ""} · ${i.timing}`);
      if (i.copy.subject) console.log(`  Subject: ${i.copy.subject}`);
      console.log(`  Body: ${i.copy.body.slice(0, 200)}${i.copy.body.length > 200 ? "..." : ""}`);
    }
  } else {
    console.log(kleur.dim(`(set ANTHROPIC_API_KEY to generate interventions)`));
  }

  console.log(``);
  const predEval = evalPredictions(scores, src.ground_truth, 0.5);
  console.log(kleur.green(`✅ Eval: precision ${predEval.precision.toFixed(2)} / recall ${predEval.recall.toFixed(2)} / F1 ${predEval.f1.toFixed(2)} vs synthetic ground truth`));
}
```

- [ ] **Write `commands/eval.ts`**

```ts
import { runFullEval } from "@rcrb/eval/dist/run.js";

export async function runEval(opts: { seed: string; users: string; days: string; withInterventions?: boolean; withLlmJudge?: boolean }) {
  const md = await runFullEval({
    seed: opts.seed,
    num_users: parseInt(opts.users, 10),
    days: parseInt(opts.days, 10),
    threshold: 0.5,
    withInterventions: !!opts.withInterventions,
    withLLMJudge: !!opts.withLlmJudge,
  });
  console.log(md);
}
```

- [ ] **Wire up `pnpm demo` script** at workspace root (already done in Phase 0).

Run: `pnpm install` then `pnpm demo`.
Expected: prints the demo output, ends with the eval line. v0 done.

- [ ] **Commit Phase 5 + tag v0**

```bash
git add packages/cli .
git commit -m "feat(cli): demo + eval commands; v0 end-to-end on synthetic data"
git tag v0.1.0
```

---

## Phase 5.5: Eval methodology fixes

**Goal:** Make the eval suite trustworthy enough that v1's quality numbers survive a senior engineer's scrutiny. Driven by the post-v0 debate findings (Miguel + Jacob).

**What's broken today:**
- `score.test.ts:32` picks the threshold at the 50th-percentile of churner scores → privileged access to ground truth
- Same seed used for tuning weights and reporting numbers → no held-out evaluation
- `critic.ts` and `eval/intervention.ts` both use Sonnet → Sonnet judges Sonnet's output (closed loop)
- `llm-judge.ts` silently substitutes `narrative_risk = 0` on error → biases scores down without surfacing
- Synthetic personas encode the patterns the heuristics look for → tautological by design
- Critic verdict is logged to `console.warn` and discarded → eval can't correlate accept-rate with downstream signals

**Tasks:**

- [ ] **Add adversarial personas to simulator**

`packages/sources/src/synthetic/personas/{re_engager,crashy_loyal,silent_lurker}.ts`:
- `re_engager`: looks lapsing for 2 weeks, then activity rebounds in last 5 days. Should NOT score high. Trip wire for false positives.
- `crashy_loyal`: high crash rate but stable usage and payments. Should NOT score high. Trip wire for over-weighting `error_rate`.
- `silent_lurker`: pays consistently, very low usage, never churns. Should NOT score high purely on usage decline.

Each gets weight 0.05 (adds 15% adversarial users). Update `personas/index.ts`. The simulator already supports the `Persona` shape — add the new files following the existing pattern.

- [ ] **Pre-register thresholds in tests**

Replace `score.test.ts:32` median-of-churners trick with explicit thresholds. Test asserts precision/recall at thresholds {0.4, 0.5, 0.6} and reports all three. Pre-registers a target set: at threshold 0.5, expect recall ≥ 0.4 AND precision ≥ 0.65 (tunable; both bars must hit).

- [ ] **Train/eval seed split**

Define two seed sets: `TRAIN_SEEDS = ["risk-test", "trend-test", ...]` (used during signal-weight tuning) and `EVAL_SEEDS = ["eval-pred", "eval-fixed-1", "eval-fixed-2"]` (used in CI assertions). Document that weight tuning may NOT use eval seeds. Add a comment block to `score.ts` listing the eval-seed contract.

- [ ] **Surface critic verdict on Intervention**

Update `Intervention` type in `@rcrb/core` to add `critique?: { scores, recommendation, notes }`. Update `intervention-agent/src/run.ts` to attach the critic result rather than only logging it. Eval can then correlate critic accept-rate with risk score / persona / signals.

- [ ] **Track LLM judge availability explicitly**

Update `RiskScore` type to add `llm_judge_available: boolean`. When `llm-judge.ts` falls back to score 0 on error, set `llm_judge_available = false` so the eval can split metrics by "with LLM" vs "without." Don't silently substitute zero into the combined score — instead, when unavailable, scale the heuristic weight to 1.0 so the user isn't penalized by a transient failure.

- [ ] **Use a different model for critic in eval mode**

The intervention-agent's `critique()` is used both at generation time (gate-check) and in eval. For eval, swap to `claude-opus-4-7` (or any model ≠ the composer's Sonnet 4.6) to break the closed loop. Add an optional `model` parameter to `critique()`; default stays Sonnet 4.6. `evalInterventions` passes Opus.

- [ ] **Update prediction.test.ts**

Test now asserts: at threshold 0.5, precision ≥ 0.65, recall ≥ 0.4. At threshold 0.4, precision ≥ 0.5, recall ≥ 0.55. Both bars must hold. Change seed to `eval-fixed-1` (an eval seed, not a tuning seed).

- [ ] **Run all evals end-to-end**

`pnpm test` should still pass. `pnpm exec tsx scripts/inspect.ts` (extended to dump per-persona scores including new adversarial ones) should show:
- `re_engager` users average score < 0.4 (NOT flagged)
- `crashy_loyal` users average score < 0.4 (NOT flagged)
- `silent_lurker` users average score < 0.4 (NOT flagged)
- `lapsing` and `wavering` (true churners) still ≥ 0.6

If adversarial personas push current weights below the bar, signal weights need re-tuning (using train seeds only).

- [ ] **Commit Phase 5.5**

```bash
git commit -m "feat(eval): adversarial personas, seed split, pre-registered thresholds, non-self-judging critic"
```

---

## Phase 6: 4 source connectors (RC, Stripe, Sentry, PostHog)

**Goal:** Each connector implements the `Source` interface, maps real provider events to the normalized `Event` schema, includes a smoke test against a sandbox, and updates README.

**Constraint:** at runtime, ≥1 of {RevenueCat, Stripe} must be configured. Sentry + PostHog are pure-optional. CLI prints a clear error if no subscription source is wired.

**Common pattern (per connector):**
1. Add package `packages/sources-<name>/`
2. Implement REST client with auth (env vars per `.env.example`)
3. Implement `backfill({ since, until })` that yields normalized `Event`s
4. Implement `subscribe(onEvent)` if provider has webhooks (else throw "not supported")
5. User matching helper (email-primary, falls back to provider-specific id)
6. Smoke test (skipped if env keys absent)
7. README section showing how to wire it up

Each connector is its own CC session. Order: RC first (the named anchor), then Stripe (web subs), then Sentry (novel angle, easy API), then PostHog (analytics, fills the usage signal).

### 6.1 RevenueCat

**Files:** `packages/sources-revenuecat/{package.json,tsconfig.json,src/{index,api,webhook,map}.ts,src/index.test.ts}`

**Auth:** API v2 secret key (`REVENUECAT_API_KEY`), project ID (`REVENUECAT_PROJECT_ID`). Reference: https://www.revenuecat.com/docs/api-v2

**Endpoints used:**
- `GET /v2/projects/{project_id}/customers` — list subscribers (paginated)
- `GET /v2/projects/{project_id}/customers/{customer_id}/transactions`
- `GET /v2/projects/{project_id}/customers/{customer_id}/active_entitlements`

**Webhook events to map:** `INITIAL_PURCHASE`, `RENEWAL`, `CANCELLATION`, `EXPIRATION`, `BILLING_ISSUE`, `SUBSCRIBER_ALIAS`, `NON_RENEWING_PURCHASE`, `PRODUCT_CHANGE`.

**Mapping table (provider event → normalized `Event.kind`):**
- `INITIAL_PURCHASE` → `subscription.purchase`
- `RENEWAL` → `subscription.renewal`
- `CANCELLATION` → `subscription.cancel`
- `EXPIRATION` → `subscription.cancel` (with payload reason="expiration")
- `BILLING_ISSUE` → `payment.failure`

User ID strategy: use `app_user_id` from RC. If email available in payload, populate `payload.email` for cross-source matching.

**Smoke test:** if `REVENUECAT_API_KEY` and `REVENUECAT_PROJECT_ID` set, fetch first page of customers, expect ≥0 results without error.

**Acceptance:** running `npx rc-retention-brain --source=revenuecat run --backfill=30d` prints normalized event count.

### 6.2 Stripe

**Files:** `packages/sources-stripe/{package.json,tsconfig.json,src/{index,api,webhook,map}.ts}`

**Auth:** secret key (`STRIPE_API_KEY`). Use `stripe` npm package.

**Endpoints used:**
- `stripe.customers.list({ limit: 100 })` (paginate via `auto_paging`)
- `stripe.subscriptions.list({ limit: 100 })`
- `stripe.events.list({ created: { gte: since } })` for backfill
- Webhook: `app.post("/webhook/stripe", verifyAndHandle)` — events filtered to relevant kinds

**Events to map:**
- `customer.subscription.created` → `subscription.purchase`
- `customer.subscription.deleted` → `subscription.cancel`
- `invoice.payment_failed` → `payment.failure`
- `invoice.payment_succeeded` → `payment.success`
- `charge.failed` → `payment.failure`
- `customer.subscription.trial_will_end` → `subscription.trial_end`

User matching: use `customer.email`. Fall back to `customer.metadata.app_user_id` if email absent.

**Smoke test:** if `STRIPE_API_KEY` set (test mode), list customers, expect to be able to enumerate.

### 6.3 Sentry

**Files:** `packages/sources-sentry/{...}`

**Auth:** auth token (`SENTRY_AUTH_TOKEN`), org/project slugs.

**Endpoints used:**
- `GET /api/0/projects/{org}/{project}/issues/?statsPeriod=14d` for active issues
- `GET /api/0/issues/{issue_id}/events/` for per-event details (includes `user.email`, `user.id`)

**Events to map:**
- Each error event → `error.client` (or `error.crash` if `level=fatal` or `mechanism.handled=false`)
- Payload: `{ issue_title, error_message, level, fingerprint }`

User matching: `event.user.email` → primary; fallback to `event.user.id` matching `app_user_id`.

**Smoke test:** fetch first page of issues, expect ≥0 results.

### 6.4 PostHog

**Files:** `packages/sources-posthog/{...}`

**Auth:** project API key + personal API key (`POSTHOG_PROJECT_API_KEY`, `POSTHOG_PERSONAL_API_KEY`), host.

**Endpoints used:**
- `GET /api/projects/{project_id}/events/?after=<iso>` for events
- `GET /api/projects/{project_id}/persons/{person_id}` for user details

**Events to map:**
- `$pageview`, custom events → `usage.feature`
- `$identify` events update user-matching context (email)
- `$capture` with `event=session_start` → `usage.session`

User matching: `person.properties.email`.

**Smoke test:** fetch first page of events, expect ≥0 results.

---

### Tasks (per connector — 4 sessions)

For each connector (RC, Stripe, Sentry, PostHog), in its own session:

- [ ] Create `packages/sources-<name>/{package.json,tsconfig.json,src/index.ts,src/api.ts,src/map.ts}`
- [ ] Implement REST/SDK client with auth
- [ ] Implement `backfill` returning AsyncIterable<Event>
- [ ] Implement `subscribe` (if webhooks supported) or throw
- [ ] Implement event mapping per the table above (no placeholders — write all mappings)
- [ ] Implement user matching helper
- [ ] Write smoke test that's skipped if env keys absent
- [ ] Update root README with one-line wiring example
- [ ] Commit `feat(sources-<name>): connector + smoke test`

After all 4 connectors: add a top-level `packages/cli/src/commands/run.ts` that wires the configured sources together, builds timelines, scores, and generates interventions. Enforce ≥1 of {RC, Stripe} at startup with a clear error message.

---

## Phase 7: Briefing renderer + seed-sandbox + temporal holdout

**Goal:** Three pieces that close the v1 user journey — the briefing the user reads, the seed script that fills sandboxes for install validation, and the temporal-holdout eval that proves the brain works on real-API data without real users.

**Files:**
- Create: `packages/cli/src/commands/run.ts` (or extend from Phase 6) — produces a markdown briefing; supports `--as-of <date>` cutoff
- Create: `packages/cli/src/commands/watch.ts` — `--watch` mode polling sources every 60s
- Create: `packages/cli/src/commands/seed-sandbox.ts` — populates RC + Stripe + (optional) Sentry + PostHog. Splits synthetic timeline into train + eval windows; pushes train, stages eval locally
- Create: `packages/cli/src/commands/reveal-future.ts` — pushes the staged eval window to sandboxes, computes actual-vs-predicted metrics, prints temporal holdout report
- Create: `packages/sources/src/synthetic/seed-real-sandbox.ts` — translates the synthetic generator into real-API calls
- Update: `examples/briefing-sample.md` — committed canonical briefing example

### Briefing renderer

`run` command writes `briefing-<YYYY-MM-DD>.md` to the working directory. Format:

```markdown
# Retention Briefing — 2026-05-08

**Account summary:** 1,247 subscribers · 73 flagged at risk · top driver: usage_decline (42)

## Top 5 at-risk users — recommended interventions

### 1. user_alice@example.com — risk 0.91
**Why flagged**
- usage_decline: sessions down 78% in last 7 days
- engagement_recency: last session 9 days ago
- error_rate: 4 crashes in last 14 days (export PDF feature)

**Recommended play**
- Channel: email
- Offer: 50% off first month
- Timing: within 24 hours
- Critic verdict: accept (4.2/5)

**Draft subject:** "Sorry the export crashed — let's make it right"
**Draft body:** [...]

[Evidence (collapsible)]
- 2026-04-29 14:31 · usage.session
- 2026-04-30 09:02 · error.crash · type=PDFExportError
- ...
```

Every intervention includes the **evidence block** — raw events that produced the signals (David's "or I won't trust the email" critique).

### `seed-sandbox` script with temporal holdout

Takes RC API key (+ Stripe test key + optional Sentry token + optional PostHog key), creates ~50 subscribers across the canonical persona shapes:

- ~30 loyal/power users (no churn signal)
- ~10 wavering users (declining usage in real time)
- ~7 lapsing users (cratering activity)
- ~3 free-rider users (payment failures via Stripe test mode)
- ~7 adversarial users (re_engagers, crashy_loyal, silent_lurkers)
- (If Sentry token) throw realistic errors via Sentry SDK tied to specific user IDs
- (If PostHog key) capture realistic event sequences via PostHog SDK

**Temporal split:** flags `--train-days 30 --eval-days 30` produce a 60-day synthetic timeline. The first 30 days are pushed to the real sandboxes immediately. The latter 30 days (including any churn events) are staged locally to `./.staged-future.json`.

Idempotent — re-runs delete previous seeded users (identified by `app_user_id` prefix `seed_`) and recreate. Documented as the canonical way to validate install before showing to others.

### `reveal-future` command

After running `seed-sandbox` and `run --as-of <cutoff>`, the user runs:

```
$ npx rc-retention-brain reveal-future
✓ Pushed staged events (days 30-60) to RC, Stripe, Sentry, PostHog
✓ Loading prior briefing (briefing-2026-01-31.md)
✓ Computing actual-vs-predicted...

📊 Temporal holdout result (cutoff 2026-01-31, eval window 30d):
   Flagged at >=0.4: 21 users
   Of those, actually churned in eval window: 15  (precision 71%)
   Total churners in eval window: 19
   Caught: 15 / 19  (recall 79%, F1 0.75)
   Missed: 4 (their score was below threshold)

   Intervention quality post-hoc:
   - Users with email + 20% offer: 8/10 active at end (vs base ~30%)
   - Users with no_op: 6/8 active (no intervention given)
```

This is the v1 hero metric. It's a temporal holdout — no peeking at future data. Real APIs, real-shape data, real outcomes against real predictions.

### Tasks

- [ ] Implement `run.ts` — reads `.env`, instantiates configured sources, builds timelines, scores, generates interventions, writes briefing markdown. `--as-of <ISO>` flag treats events at-or-before that date as the input window
- [ ] Implement evidence-block rendering on each intervention
- [ ] Implement `watch.ts` — polls non-webhook sources every 60s, sets up webhook listeners where supported
- [ ] Implement `seed-sandbox.ts` — creates users in RC + Stripe + (Sentry + PostHog if keys); supports `--train-days` and `--eval-days`; stages future events to `.staged-future.json`
- [ ] Implement `reveal-future.ts` — reads staged file, pushes events to sandboxes, reads back actual outcomes via real API calls, loads prior briefing's predictions, prints temporal holdout report
- [ ] Save the canonical temporal-holdout output to `examples/temporal-holdout-sample.md`
- [ ] Commit `feat(cli): briefing renderer + seed-sandbox + temporal holdout` with the example outputs in `examples/`

**Resend channel + `--send` deferred to v1.1.** v1 ships briefing-only — installing v1 cannot, by design, send anything to your customers. This collapses the trust ask: the user reads briefings, edits the ones they don't like, manually copies into their existing email tool. Once that flow has been used for a month and trusted, v1.1 adds Resend dispatch with explicit `--send` opt-in.

---

## Phase 8: Install polish + DM-readiness

**Goal:** Clone → first useful output on a real RC + Stripe + Sentry + PostHog sandbox in <10 min, validated via screen recording. README install-first with a real briefing front and center. End-to-end smoke. DM drafted.

**Files:**
- Modify: `README.md` (rewrite install-first; the README IS the artifact)
- Create: `packages/cli/src/commands/init.ts`
- Create: `docs/{architecture,extending,roadmap}.md`
- Update: `examples/briefing-sample.md` (committed canonical briefing from a seeded sandbox)

### Tasks

- [ ] **Implement `init` command** — interactive prompts (use `@inquirer/prompts`) for each key, write `.env`. Asks for at least one of {RC, Stripe} and prints a clear error if neither provided. Sentry + PostHog optional.

- [ ] **Write `docs/architecture.md`** — diagram of source → timeline → risk → intervention → briefing, link to spec

- [ ] **Write `docs/extending.md`** — concrete walkthrough of "add a new source in 30 min" using one of the 4 connectors as template

- [ ] **Rewrite `README.md`** so it stands alone as the artifact

Structure:
```
# rc-retention-brain

[Real briefing screenshot embedded here — top of file, before any prose]

## Install in 3 minutes
1. npx rc-retention-brain init  (paste keys; ≥1 of {RC, Stripe} required)
2. npx rc-retention-brain seed-sandbox  (populates sandboxes with realistic users)
3. npx rc-retention-brain run  (writes briefing-<date>.md)

## What it does

[Per-user, cross-source, decision-oriented retention agent. Sentence on the four-source thesis.]

## Sources

[Table of 4 supported sources with status, signal type, auth requirement, and link to extending.md]

## Architecture

[link to docs/architecture.md, one diagram]

## Eval

[how to run, what the bars are]

## Roadmap

[link to roadmap.md]

## License

MIT
```

- [ ] **End-to-end smoke on real sandbox + screen recording**

The recording is what gates the DM. If install takes >10 min, fix install before fixing anything else.

1. Create RC sandbox account, Stripe test-mode account
2. (Optional) Sentry free-tier project, PostHog free-tier project
3. From a clean machine: `git clone`, `pnpm install`, `npx rc-retention-brain init`
4. Paste keys, run `seed-sandbox`, run `run`
5. Inspect the briefing — does it have real users, real signals, plausible interventions, evidence blocks?
6. Record the entire flow once it's clean. Embed a still + GIF in the README.

- [ ] **Final eval run + commit**

```bash
npx rc-retention-brain eval --with-interventions --with-llm-judge > examples/briefing-sample.md
git add examples docs README.md
git commit -m "docs: install-first README, architecture + extending docs, sample briefing"
git tag v1.0.0
```

- [ ] **Draft DM** in `docs/DM-DRAFT.md` (NOT committed publicly until final)

Per `SPEC.md` DM section. Sleep on it, edit, send.

---

## Self-review notes (post-debate revision, 2026-05-08)

- ✅ Phase 5.5 added — fixes eval methodology (adversarial personas, seed split, pre-registered thresholds, non-self-judging critic)
- ✅ Phase 6 cut to 4 connectors (RC, Stripe, Sentry, PostHog) instead of 7. RC mandatory dropped — ≥1 of {RC, Stripe} required at runtime
- ✅ Phase 7 reframed: briefing renderer + seed-sandbox script. Resend channel deferred to v1.1
- ✅ Phase 8 updated: README is the artifact, screen recording gates the DM
- ✅ Type consistency: `Event`, `Intervention`, `Channel`, `OfferKind`, `MODEL_ID` defined once in `@rcrb/core`
- ⚠️ Quality bars after Phase 5.5 will likely shift down (adversarial personas reduce baseline precision). That's OK — the new bars are more honest. Real numbers will land during 5.5 implementation.
- ⚠️ Phase 6 connector tasks are templated; appropriate for autonomous CC execution where each connector is one session
- ⚠️ Phase 8 `init` interactive flow uses `@inquirer/prompts` — task assumes Claude will pick a sensible structure since the dependency choice is locked but the prompts list is the install-time concern
