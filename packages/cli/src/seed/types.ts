export type SeedPushResult = {
  source: "revenuecat" | "stripe" | "sentry" | "posthog";
  customers_created: number;
  customers_deleted: number;
  events_pushed: number;
  events_skipped: number;
  notes: string[];
};
