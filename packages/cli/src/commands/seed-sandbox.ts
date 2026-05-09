import "dotenv/config";
import kleur from "kleur";
import { loadSourcesFromEnv, NoSubscriptionSourceError } from "../source-config.js";
import { runSeed } from "../seed/index.js";

const DEFAULT_USERS = 50;

function parsePositiveInt(value: string, name: string): number {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !Number.isInteger(n)) {
    console.error(kleur.red(`invalid --${name}: ${value} (expected positive integer)`));
    process.exit(2);
  }
  return n;
}

export async function runSeedSandbox(opts: {
  trainDays: string;
  evalDays: string;
  users: string;
  seed: string;
  reset?: boolean;
}): Promise<void> {
  let bundle;
  try {
    bundle = loadSourcesFromEnv();
  } catch (err) {
    if (err instanceof NoSubscriptionSourceError) {
      console.error(kleur.red(`✗ ${err.message}`));
      process.exit(2);
    }
    throw err;
  }

  const trainDays = parsePositiveInt(opts.trainDays, "train-days");
  const evalDays = parsePositiveInt(opts.evalDays, "eval-days");
  const users = parsePositiveInt(opts.users, "users");
  const idempotentReset = opts.reset !== false;

  const enabledNames = Object.entries(bundle.enabled)
    .filter(([, v]) => (Array.isArray(v) ? v.length > 0 : !!v))
    .map(([k, v]) => (Array.isArray(v) ? v.map((label) => `${k}:${label}`).join(",") : k));
  console.log(
    kleur.cyan().bold(
      `🌱 Seeding ${enabledNames.join(", ")} with ${users} users · ${trainDays}d train + ${evalDays}d eval`
    )
  );

  const seedOpts: Parameters<typeof runSeed>[0] = {
    trainDays,
    evalDays,
    numUsers: users,
    seed: opts.seed,
    enabled: bundle.enabled,
    idempotentReset,
  };
  if (bundle.enabled.stripe) {
    seedOpts.stripeConfig = { apiKey: process.env.STRIPE_API_KEY! };
  }
  if (bundle.enabled.sentry) {
    seedOpts.sentryConfig = {
      ...(process.env.SENTRY_DSN ? { dsn: process.env.SENTRY_DSN } : {}),
      ...(process.env.SENTRY_AUTH_TOKEN ? { authToken: process.env.SENTRY_AUTH_TOKEN } : {}),
      ...(process.env.SENTRY_ORG_SLUG ? { orgSlug: process.env.SENTRY_ORG_SLUG } : {}),
      ...(process.env.SENTRY_PROJECT_SLUG ? { projectSlug: process.env.SENTRY_PROJECT_SLUG } : {}),
    };
  }
  if (bundle.enabled.posthog && process.env.POSTHOG_PROJECT_API_KEY) {
    const phCfg: { projectApiKey: string; host?: string } = {
      projectApiKey: process.env.POSTHOG_PROJECT_API_KEY,
    };
    if (process.env.POSTHOG_HOST) phCfg.host = process.env.POSTHOG_HOST;
    seedOpts.posthogConfig = phCfg;
  } else if (bundle.enabled.posthog) {
    console.log(
      kleur.yellow(
        `   ⚠ POSTHOG_PROJECT_API_KEY not set — PostHog reads work but we cannot capture events back. Set POSTHOG_PROJECT_API_KEY to enable PostHog seeding.`
      )
    );
  }

  const result = await runSeed(seedOpts);
  console.log("");
  console.log(
    kleur.green(
      `✅ Seeded ${result.train_events} events to sandboxes · staged ${result.eval_events} events to ${result.staged_path}`
    )
  );
  console.log(
    kleur.dim(
      `   train cutoff: ${result.cutoff_iso} · eval until: ${result.eval_until_iso}`
    )
  );
}

// Default flags for commander; treats --no-reset to disable idempotent cleanup
export const SEED_SANDBOX_DEFAULTS = {
  trainDays: "30",
  evalDays: "30",
  users: String(DEFAULT_USERS),
  seed: "temporal-1",
};
