import type { Source } from "@rcrb/sources";
import { revenueCatSource } from "@rcrb/sources-revenuecat";
import { stripeSource } from "@rcrb/sources-stripe";
import { sentrySource } from "@rcrb/sources-sentry";
import { postHogSource } from "@rcrb/sources-posthog";
import { loadMCPSources, mcpSource, type LoadedMCPSource } from "@rcrb/sources-mcp";

export type EnabledSources = {
  revenuecat: boolean;
  stripe: boolean;
  sentry: boolean;
  posthog: boolean;
  mcp: string[];
};

export type SourceBundle = {
  sources: Source[];
  enabled: EnabledSources;
};

export class NoSubscriptionSourceError extends Error {
  constructor() {
    super(
      "no subscription source configured — set REVENUECAT_API_KEY+REVENUECAT_PROJECT_ID or STRIPE_API_KEY in .env"
    );
    this.name = "NoSubscriptionSourceError";
  }
}

export function loadSourcesFromEnv(
  env: NodeJS.ProcessEnv = process.env,
  cwd: string = process.cwd()
): SourceBundle {
  const sources: Source[] = [];
  const enabled: EnabledSources = {
    revenuecat: false,
    stripe: false,
    sentry: false,
    posthog: false,
    mcp: [],
  };

  if (env.REVENUECAT_API_KEY && env.REVENUECAT_PROJECT_ID) {
    sources.push(
      revenueCatSource({
        apiKey: env.REVENUECAT_API_KEY,
        projectId: env.REVENUECAT_PROJECT_ID,
      })
    );
    enabled.revenuecat = true;
  }

  if (env.STRIPE_API_KEY) {
    sources.push(stripeSource({ apiKey: env.STRIPE_API_KEY }));
    enabled.stripe = true;
  }

  if (env.SENTRY_AUTH_TOKEN && env.SENTRY_ORG_SLUG && env.SENTRY_PROJECT_SLUG) {
    sources.push(
      sentrySource({
        authToken: env.SENTRY_AUTH_TOKEN,
        orgSlug: env.SENTRY_ORG_SLUG,
        projectSlug: env.SENTRY_PROJECT_SLUG,
      })
    );
    enabled.sentry = true;
  }

  if (env.POSTHOG_PERSONAL_API_KEY && env.POSTHOG_PROJECT_ID) {
    const cfg: { personalApiKey: string; projectId: string; host?: string } = {
      personalApiKey: env.POSTHOG_PERSONAL_API_KEY,
      projectId: env.POSTHOG_PROJECT_ID,
    };
    if (env.POSTHOG_HOST) cfg.host = env.POSTHOG_HOST;
    sources.push(postHogSource(cfg));
    enabled.posthog = true;
  }

  const mcpEntries: LoadedMCPSource[] = loadMCPSources({ cwd, env });
  for (const entry of mcpEntries) {
    sources.push(mcpSource(entry));
    enabled.mcp.push(entry.label);
  }

  if (!enabled.revenuecat && !enabled.stripe) {
    throw new NoSubscriptionSourceError();
  }

  return { sources, enabled };
}
