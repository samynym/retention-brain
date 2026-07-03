import {
  ALL_SOURCES,
  BILLING_SOURCES,
  type SourceCategory,
} from "../fixtures/sources";
import type { Briefing } from "../types/briefing";

/**
 * One in-memory state machine for the whole onboarding mockup. No persistence,
 * no network — `useReducer` over this is the entire app state.
 */

export type Phase =
  | "checking" // verifying the Supabase session on load
  | "signin"
  | "connect"
  | "analyzing"
  | "briefing";
export type ConnState = "idle" | "connecting" | "connected";

/** The signed-in operator (the indie dev running the tool). */
export type Identity = { email: string; provider: string };

/** Which briefing dataset the result screen renders (dev toggle). */
export type Scenario = "sample" | "zero";

/** App = the dev's onboarding flow; Operator = the shipper's beta telemetry. */
export type AppView = "app" | "operator";

/**
 * Per-source connection. `provider` records the concrete tool chosen for
 * multi-provider sources (e.g. PostHog out of PostHog/Mixpanel/Amplitude) so
 * the UI can show what actually connected via MCP.
 */
export type SourceConn = {
  status: ConnState;
  provider?: string;
};

export type State = {
  phase: Phase;
  /** Mock OAuth status for the entry gate. */
  auth: ConnState;
  identity: Identity | null;
  sources: Record<string, SourceConn>;
  /** Gmail send channel — connected from the email action, not the connect screen. */
  gmail: ConnState;
  scenario: Scenario;
  /** dev-only: which surface is showing (onboarding flow vs operator dashboard) */
  view: AppView;
  /** real briefing from the backend (null = show fixtures per scenario) */
  briefing: Briefing | null;
  /** showing a cached briefing while a fresh run finishes in the background */
  refreshing: boolean;
  /** error message if the last analyze failed */
  analyzeError: string | null;
};

export type Action =
  | { type: "SESSION_OK"; identity: Identity }
  | { type: "SESSION_NONE" } // no session — show sign-in
  | { type: "SIGN_OUT" }
  | { type: "CONNECT_START"; id: string; provider?: string }
  | { type: "CONNECT_DONE"; id: string; provider?: string }
  | { type: "GMAIL_START" }
  | { type: "GMAIL_DONE" }
  | { type: "ANALYZE" }
  | { type: "ANALYSIS_DEMO" } // demo mode: jump to the fixture briefing, no backend
  | { type: "ANALYSIS_DONE"; briefing: Briefing }
  | { type: "ANALYSIS_SHOW_CACHED"; briefing: Briefing }
  | { type: "ANALYSIS_ERROR"; message: string }
  | { type: "SET_SCENARIO"; scenario: Scenario }
  | { type: "SET_VIEW"; view: AppView }
  | { type: "RESET" };

export const initialState: State = {
  phase: "checking",
  auth: "idle",
  identity: null,
  sources: Object.fromEntries(
    ALL_SOURCES.map((s) => [s.id, { status: "idle" } as SourceConn]),
  ),
  gmail: "idle",
  scenario: "sample",
  view: "app",
  briefing: null,
  refreshing: false,
  analyzeError: null,
};

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "SESSION_OK":
      return {
        ...state,
        auth: "connected",
        identity: action.identity,
        phase: state.phase === "checking" || state.phase === "signin" ? "connect" : state.phase,
      };
    case "SESSION_NONE":
      return { ...initialState, phase: "signin", scenario: state.scenario, view: state.view };
    case "SIGN_OUT":
      return { ...initialState, phase: "signin", scenario: state.scenario, view: state.view };
    case "CONNECT_START":
      return {
        ...state,
        sources: {
          ...state.sources,
          [action.id]: { status: "connecting", provider: action.provider },
        },
      };
    case "CONNECT_DONE":
      return {
        ...state,
        sources: {
          ...state.sources,
          [action.id]: { status: "connected", provider: action.provider },
        },
      };
    case "GMAIL_START":
      return { ...state, gmail: "connecting" };
    case "GMAIL_DONE":
      return { ...state, gmail: "connected" };
    case "ANALYZE":
      return { ...state, phase: "analyzing", analyzeError: null };
    case "ANALYSIS_DEMO":
      // demo mode — show the fixture briefing for the active scenario (briefing
      // stays null so BriefingScreen renders fixtures, not a live object).
      return {
        ...state,
        phase: "briefing",
        briefing: null,
        refreshing: false,
        analyzeError: null,
      };
    case "ANALYSIS_SHOW_CACHED":
      // a fresh run is still going — show the cached briefing now, refreshing
      return {
        ...state,
        phase: "briefing",
        briefing: action.briefing,
        refreshing: true,
        analyzeError: null,
      };
    case "ANALYSIS_DONE":
      return {
        ...state,
        phase: "briefing",
        briefing: action.briefing,
        refreshing: false,
        analyzeError: null,
      };
    case "ANALYSIS_ERROR":
      return { ...state, phase: "briefing", refreshing: false, analyzeError: action.message };
    case "SET_SCENARIO":
      // dev preview of fixtures — drop any live briefing so fixtures show
      return {
        ...state,
        scenario: action.scenario,
        briefing: null,
        refreshing: false,
        analyzeError: null,
      };
    case "SET_VIEW":
      return { ...state, view: action.view };
    case "RESET":
      // dev reset — wipe the flow but keep the signed-in session
      return {
        ...initialState,
        phase: state.identity ? "connect" : "signin",
        auth: state.auth,
        identity: state.identity,
        scenario: state.scenario,
        view: state.view,
      };
    default:
      return state;
  }
}

// ---- Derived selectors -------------------------------------------------

export function connOf(state: State, id: string): SourceConn {
  return state.sources[id] ?? { status: "idle" };
}

export function isConnected(state: State, id: string): boolean {
  return connOf(state, id).status === "connected";
}

/** At least one billing source connected — the gate for "Analyze". */
export function hasBilling(state: State): boolean {
  return BILLING_SOURCES.some((s) => isConnected(state, s.id));
}

/** The distinct set of connected categories — drives the nudge banners. */
export function connectedCategories(state: State): Set<SourceCategory> {
  const set = new Set<SourceCategory>();
  for (const s of ALL_SOURCES) {
    if (isConnected(state, s.id)) set.add(s.category);
  }
  return set;
}

export function connectedCount(state: State): number {
  return ALL_SOURCES.filter((s) => isConnected(state, s.id)).length;
}
