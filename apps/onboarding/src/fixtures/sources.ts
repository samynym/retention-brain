/**
 * The catalog of connectable data sources, mirroring the integration surface
 * described in PRODUCT.md / ARCHITECTURE.md: a required billing source plus
 * optional signal sources that sharpen the picture. All mock — "Connect"
 * simulates an OAuth / MCP round-trip, nothing leaves the browser.
 */

export type SourceCategory = "billing" | "analytics" | "errors" | "support";

/**
 * How a source connects:
 *  - "direct": one provider, click connects it (RevenueCat, Stripe, Sentry).
 *  - "picker": several providers behind one slot — pick which tool you use,
 *    then its MCP server connects (analytics, support).
 *  - "mcp_endpoint": bring-your-own MCP server by reference (other billing).
 */
export type ConnectVia = "direct" | "picker" | "mcp_endpoint" | "secret_key" | "oauth";

export type SourceDef = {
  id: string;
  name: string;
  /** human summary of what this slot covers, shown under the name */
  blurb: string;
  category: SourceCategory;
  /** one-line value the source unlocks */
  unlocks: string;
  connectVia: ConnectVia;
  /** selectable concrete providers (for "picker"); 1 entry for "direct" */
  providers: string[];
  /** picker slots: offer a "bring any MCP server" fallback so the list never
   *  reads as exhaustive (the integration surface is MCP-pluggable). */
  allowOtherMcp?: boolean;
  /** secret_key slots: guidance shown next to the key input */
  keyHelp?: string;
  keyPlaceholder?: string;
  /** secret_key slots: exact read permissions the user should select */
  keyScopes?: string[];
  /** secret_key slots: deep link to where the dev creates the key */
  keyLink?: { url: string; label: string };
  /** oauth slots: the backend connector kind (e.g. "sentry", "posthog") */
  oauthProvider?: string;
};

export const BILLING_SOURCES: SourceDef[] = [
  {
    id: "revenuecat",
    name: "RevenueCat",
    blurb: "Mobile subscriptions",
    category: "billing",
    unlocks: "Trials, renewals, cancels, refunds",
    connectVia: "secret_key",
    providers: ["RevenueCat"],
    keyHelp:
      "Create a RevenueCat v2 API key with read access, then paste it here.",
    keyPlaceholder: "sk_… (RevenueCat v2)",
    keyScopes: ["Projects: Read", "Customers: Read", "Subscriptions: Read"],
    keyLink: {
      url: "https://app.revenuecat.com",
      label: "Open RevenueCat API keys →",
    },
  },
  {
    id: "stripe",
    name: "Stripe",
    blurb: "Web subscriptions & invoices",
    category: "billing",
    unlocks: "Charges, failures, dunning state",
    connectVia: "secret_key",
    providers: ["Stripe"],
    keyHelp:
      "Create a restricted key in Stripe, leave write access off, and paste the rk_ key here.",
    keyPlaceholder: "rk_live_… (read-only)",
    keyScopes: ["Customers: Read", "Subscriptions: Read", "Charges: Read"],
    keyLink: {
      url: "https://dashboard.stripe.com/apikeys/create?name=Retention+Brain",
      label: "Create a read-only key in Stripe →",
    },
  },
  {
    id: "other_billing",
    name: "Other billing source",
    blurb: "Any MCP server",
    category: "billing",
    unlocks: "Bring your own billing via MCP",
    connectVia: "mcp_endpoint",
    providers: [],
  },
];

export const OPTIONAL_SOURCES: SourceDef[] = [
  {
    id: "analytics",
    name: "Product analytics",
    blurb: "PostHog (Mixpanel/Amplitude soon)",
    category: "analytics",
    unlocks: "Usage decline & the aha moment",
    connectVia: "oauth",
    oauthProvider: "posthog",
    providers: ["PostHog"],
  },
  {
    id: "errors",
    name: "Error tracking",
    blurb: "Sentry",
    category: "errors",
    unlocks: "Crash-driven churn",
    connectVia: "oauth",
    oauthProvider: "sentry",
    providers: ["Sentry"],
  },
  {
    id: "support",
    name: "Support inbox",
    blurb: "Gmail · Crisp · Help Scout",
    category: "support",
    unlocks: "Complaint & sentiment signal — even a plain email inbox",
    connectVia: "picker",
    // Ordered by how common they are at the indie/small-team ICP: email-first,
    // then the bootstrapped-favorite tools, then the funded-startup one.
    // MCP-pluggable, so anything with an API can be added beyond this list.
    providers: ["Gmail", "Crisp", "Help Scout", "Plain", "Intercom"],
    allowOtherMcp: true,
  },
];

export const ALL_SOURCES: SourceDef[] = [...BILLING_SOURCES, ...OPTIONAL_SOURCES];

export function sourceById(id: string): SourceDef | undefined {
  return ALL_SOURCES.find((s) => s.id === id);
}
