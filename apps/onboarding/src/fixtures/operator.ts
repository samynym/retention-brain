/**
 * Mock operator/beta telemetry. This is the ONLY thing the person who shipped
 * the tool gets to see across their invited devs: product-usage events, funnel
 * counts, and — because the beta runs on OUR model key — what each dev is
 * costing in model spend. Never the briefing content, never a customer's
 * billing data.
 *
 * The per-dev cost is the signal for when BYO-key becomes worth introducing:
 * once the spend on a few heavy devs hurts, that's who you move to their own key.
 */

export type FunnelStep = { label: string; count: number };

export type DevRow = {
  id: string;
  /** masked — operator never sees the full identity in the beta dashboard */
  emailMasked: string;
  /** categories connected, as metadata only (not the data behind them) */
  sources: string[];
  analyses: number;
  /** estimated model spend on our key, this week */
  cost: string;
  lastActive: string;
  status: "active" | "stalled" | "signed-in";
  /** opted to share a briefing for quality review (the only content path) */
  sharedBriefing: boolean;
};

export const OPERATOR = {
  invited: 50,
  activeThisWeek: 5,
  lastRunAgo: "2h ago",
  /** total model spend on our key this week — the cost you're absorbing.
      Realistic at optimized routing: cheap model for scoring/judge (flagged
      users only), mid model for the final drafts. ~$0.30-0.60 per run. */
  spendThisWeek: "$5.50",
  funnel: [
    { label: "Signed in", count: 12 },
    { label: "Connected billing", count: 7 },
    { label: "Ran an analysis", count: 5 },
    { label: "Sent an email", count: 2 },
  ] satisfies FunnelStep[],
  sharedForReview: 2,
  devs: [
    {
      id: "dev_01",
      emailMasked: "ma••@fittrack.app",
      sources: ["billing", "analytics", "errors"],
      analyses: 4,
      cost: "$1.60",
      lastActive: "2h ago",
      status: "active",
      sharedBriefing: true,
    },
    {
      id: "dev_02",
      emailMasked: "jo••@lumalist.io",
      sources: ["billing", "analytics"],
      analyses: 3,
      cost: "$0.95",
      lastActive: "5h ago",
      status: "active",
      sharedBriefing: false,
    },
    {
      id: "dev_03",
      emailMasked: "pr••@trailmix.app",
      sources: ["billing", "analytics", "support"],
      analyses: 6,
      cost: "$2.40",
      lastActive: "yesterday",
      status: "active",
      sharedBriefing: true,
    },
    {
      id: "dev_04",
      emailMasked: "sa••@deepwork.so",
      sources: ["billing"],
      analyses: 2,
      cost: "$0.40",
      lastActive: "yesterday",
      status: "active",
      sharedBriefing: false,
    },
    {
      id: "dev_05",
      emailMasked: "ke••@brewpad.co",
      sources: ["billing", "errors"],
      analyses: 1,
      cost: "$0.15",
      lastActive: "2 days ago",
      status: "active",
      sharedBriefing: false,
    },
    {
      id: "dev_06",
      emailMasked: "ni••@studyloop.app",
      sources: ["billing"],
      analyses: 0,
      cost: "$0.00",
      lastActive: "3 days ago",
      status: "stalled",
      sharedBriefing: false,
    },
    {
      id: "dev_07",
      emailMasked: "al••@routinely.app",
      sources: [],
      analyses: 0,
      cost: "$0.00",
      lastActive: "4 days ago",
      status: "signed-in",
      sharedBriefing: false,
    },
  ] satisfies DevRow[],
};
