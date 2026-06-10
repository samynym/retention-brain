import { useEffect, useReducer, useRef } from "react";
import { Analyzing } from "./components/Analyzing";
import { BriefingScreen } from "./components/BriefingScreen";
import { CheckingScreen } from "./components/CheckingScreen";
import { Shell } from "./components/Chrome";
import { ConnectScreen } from "./components/ConnectScreen";
import { DevToolbar } from "./components/DevToolbar";
import { NotAllowedScreen } from "./components/NotAllowedScreen";
import { OperatorView } from "./components/OperatorView";
import { SignInScreen } from "./components/SignInScreen";
import { track } from "./lib/analytics";
import {
  connectKeySource,
  getLatest,
  getMe,
  getSources,
  startAnalyze,
  startOAuth,
} from "./lib/api";
import { supabase } from "./lib/supabase";
import { ALL_SOURCES } from "./fixtures/sources";
import {
  connectedCategories,
  connectedCount,
  initialState,
  reducer,
} from "./state/machine";

const CONNECT_MS = 1000;
const POLL_MS = 2500;
const POLL_TIMEOUT_MS = 300_000;

// Demo mode (VITE_DEMO=1): a fully self-contained, shareable build with no
// sign-in gate and no backend. Skips the magic-link auth and mocks
// every connect + analyze so anyone with the link can click straight through
// to the briefing. The real (env-unset) build is unchanged.
const DEMO = import.meta.env.VITE_DEMO === "1";
const DEMO_IDENTITY = { email: "you@yourcompany.com", provider: "demo" };
const ANALYZE_MS = 1500;

// The dev toolbar (scenario switch / operator / reset) is a build-time affordance,
// not product UI — show it only in local dev or the shareable demo build, never
// in the real production build.
const SHOW_DEV_TOOLBAR = import.meta.env.DEV || DEMO;

function errMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

function isLegacyStripeTestSource(source: { kind: string; label: string | null }): boolean {
  return source.kind === "stripe" && /\(test\)/i.test(source.label ?? "");
}

export function App() {
  const [state, dispatch] = useReducer(reducer, initialState);
  // Track simulated timers (mock connects) so they're cleared on reset/unmount.
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  // The active briefing poll, cancellable on reset/unmount.
  const pollTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function stopPolling() {
    if (pollTimer.current) {
      clearTimeout(pollTimer.current);
      pollTimer.current = null;
    }
  }

  // Resolve the Supabase session → signed-in or none.
  // Demo mode skips auth entirely and drops the visitor straight into Connect.
  useEffect(() => {
    if (DEMO) {
      dispatch({ type: "SESSION_OK", identity: DEMO_IDENTITY });
      return;
    }
    let mounted = true;
    const { data: sub } = supabase.auth.onAuthStateChange(async (_event, session) => {
      if (!mounted) return;
      if (!session) {
        dispatch({ type: "SESSION_NONE" });
        return;
      }
      try {
        const me = await getMe();
        if (!mounted) return;
        if (me.allowlisted) {
          void track("session_started");
          dispatch({ type: "SESSION_OK", identity: { email: me.email, provider: "email" } });
        } else {
          dispatch({ type: "SESSION_DENIED", email: me.email });
        }
      } catch {
        if (mounted) dispatch({ type: "SESSION_NONE" });
      }
    });
    return () => {
      mounted = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    return () => {
      timers.current.forEach(clearTimeout);
      stopPolling();
    };
  }, []);

  // Reflect already-connected sources once signed in (so reconnect isn't needed).
  // Backend kinds map to the connect-screen source slots.
  useEffect(() => {
    if (!state.identity || DEMO) return;
    let active = true;
    const kindToSlot: Record<string, string> = {
      stripe: "stripe",
      revenuecat: "revenuecat",
      sentry: "errors",
      posthog: "analytics",
    };
    getSources()
      .then((sources) => {
        if (!active) return;
        for (const s of sources) {
          // Old local connects stored test Stripe keys as "Stripe (test)".
          // Don't treat those as a real connected billing source; show the
          // normal restricted-key form so the user can replace it.
          if (isLegacyStripeTestSource(s)) continue;
          dispatch({
            type: "CONNECT_DONE",
            id: kindToSlot[s.kind] ?? s.kind,
            provider: s.label ?? s.kind,
          });
        }
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [state.identity]);

  // Clean the ?connected / ?connect_error params left by the OAuth redirect.
  useEffect(() => {
    if (window.location.search.includes("connect")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
  }, []);

  async function handleSignOut() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    stopPolling();
    if (DEMO) {
      // No real session — just reset the flow back to Connect.
      dispatch({ type: "RESET" });
      return;
    }
    await supabase.auth.signOut();
    dispatch({ type: "SIGN_OUT" });
  }

  // Simulated source / Gmail connects (~1s). Pure mock until real MCP sources land.
  function handleConnect(id: string, provider: string) {
    dispatch({ type: "CONNECT_START", id, provider });
    const t = setTimeout(() => dispatch({ type: "CONNECT_DONE", id, provider }), CONNECT_MS);
    timers.current.push(t);
  }

  function handleConnectGmail() {
    dispatch({ type: "GMAIL_START" });
    const t = setTimeout(() => dispatch({ type: "GMAIL_DONE" }), CONNECT_MS);
    timers.current.push(t);
  }

  // Real source connect (Sentry, PostHog) — redirect to the provider's OAuth.
  async function handleConnectOAuth(provider: string) {
    void track("source_connect_started", { provider, mode: "oauth" });
    if (DEMO) {
      // No OAuth round-trip in demo — mock-connect the matching slot.
      const src = ALL_SOURCES.find((s) => s.oauthProvider === provider);
      if (src) handleConnect(src.id, src.providers[0] ?? src.name);
      return;
    }
    try {
      const url = await startOAuth(provider);
      window.location.href = url;
    } catch (err) {
      void track("source_connect_failed", { provider, mode: "oauth", message: errMessage(err) });
      // eslint-disable-next-line no-alert
      window.alert(`Couldn't start ${provider} connect: ${errMessage(err)}`);
    }
  }

  // Real key-based source connect (Stripe, RevenueCat) — validated + stored server-side.
  async function handleConnectSecret(
    id: string,
    secret: string,
  ): Promise<{ ok: boolean; error?: string }> {
    if (id !== "stripe" && id !== "revenuecat") return { ok: false, error: "Unsupported source." };
    void track("source_connect_started", { provider: id, mode: "key" });
    if (DEMO) {
      // No backend validation in demo — accept the key and mock-connect.
      handleConnect(id, id === "stripe" ? "Stripe" : "RevenueCat");
      return { ok: true };
    }
    try {
      const { label } = await connectKeySource(id, secret);
      dispatch({ type: "CONNECT_DONE", id, provider: label });
      void track("source_connect_completed", { provider: id, mode: "key" });
      return { ok: true };
    } catch (err) {
      const message = errMessage(err);
      void track("source_connect_failed", { provider: id, mode: "key", message });
      return { ok: false, error: message };
    }
  }

  // Analyze: start a background run, then poll. Show the cached briefing
  // instantly (if any) and refresh in the background; otherwise hold the loader.
  async function handleAnalyze() {
    stopPolling();
    dispatch({ type: "ANALYZE" });
    void track("analyze_started", { connected: connectedCount(state) });
    if (DEMO) {
      // No backend run — hold the loader briefly, then show the fixtures.
      const t = setTimeout(() => dispatch({ type: "ANALYSIS_DEMO" }), ANALYZE_MS);
      timers.current.push(t);
      return;
    }
    try {
      await startAnalyze({ cheap: true });
    } catch (err) {
      const message = errMessage(err);
      void track("analyze_failed", { message });
      dispatch({ type: "ANALYSIS_ERROR", message });
      return;
    }

    const startedAt = Date.now();
    const poll = async () => {
      let res;
      try {
        res = await getLatest();
      } catch (err) {
        const message = errMessage(err);
        void track("analyze_failed", { message });
        dispatch({ type: "ANALYSIS_ERROR", message });
        return;
      }
      const { briefing, run } = res;
      if (run.state === "error") {
        const message = run.error ?? "Analysis failed.";
        void track("analyze_failed", { message });
        dispatch({ type: "ANALYSIS_ERROR", message });
        return;
      }
      if (run.state === "done" && briefing) {
        void track("briefing_ready");
        dispatch({ type: "ANALYSIS_DONE", briefing });
        return;
      }
      if (briefing) {
        void track("briefing_cached_shown");
        dispatch({ type: "ANALYSIS_SHOW_CACHED", briefing });
      }
      if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
        const message = "The analysis took too long.";
        void track("analyze_failed", { message });
        dispatch({ type: "ANALYSIS_ERROR", message });
        return;
      }
      pollTimer.current = setTimeout(poll, POLL_MS);
    };
    void poll();
  }

  function handleReset() {
    timers.current.forEach(clearTimeout);
    timers.current = [];
    stopPolling();
    dispatch({ type: "RESET" });
  }

  if (state.view === "operator") {
    return (
      <>
        <Shell identity={state.identity} onSignOut={handleSignOut}>
          <OperatorView onBack={() => dispatch({ type: "SET_VIEW", view: "app" })} />
        </Shell>
        {SHOW_DEV_TOOLBAR && (
          <DevToolbar
            phase={state.phase}
            scenario={state.scenario}
            view={state.view}
            onScenario={(scenario) => dispatch({ type: "SET_SCENARIO", scenario })}
            onView={(view) => dispatch({ type: "SET_VIEW", view })}
            onReset={handleReset}
          />
        )}
      </>
    );
  }

  return (
    <>
      {state.phase === "checking" && <CheckingScreen />}

      {state.phase === "signin" && <SignInScreen />}

      {state.phase === "not_allowed" && (
        <NotAllowedScreen email={state.identity?.email ?? ""} onSignOut={handleSignOut} />
      )}

      {state.phase === "connect" && (
        <Shell identity={state.identity} onSignOut={handleSignOut}>
          <ConnectScreen
            state={state}
            identity={state.identity}
            onConnect={handleConnect}
            onConnectSecret={handleConnectSecret}
            onConnectOAuth={handleConnectOAuth}
            onAnalyze={handleAnalyze}
            onSignOut={handleSignOut}
          />
        </Shell>
      )}

      {state.phase === "analyzing" && (
        <Shell identity={state.identity} onSignOut={handleSignOut}>
          <Analyzing />
        </Shell>
      )}

      {state.phase === "briefing" && (
        <Shell identity={state.identity} onSignOut={handleSignOut}>
          <BriefingScreen
            scenario={state.scenario}
            briefing={state.briefing}
            refreshing={state.refreshing}
            analyzeError={state.analyzeError}
            cats={connectedCategories(state)}
            connectedCount={connectedCount(state)}
            identity={state.identity}
            gmail={state.gmail}
            onConnectGmail={handleConnectGmail}
            onSignOut={handleSignOut}
            allowFixtures={DEMO}
          />
        </Shell>
      )}

      {SHOW_DEV_TOOLBAR && (
        <DevToolbar
          phase={state.phase}
          scenario={state.scenario}
          view={state.view}
          onScenario={(scenario) => dispatch({ type: "SET_SCENARIO", scenario })}
          onView={(view) => dispatch({ type: "SET_VIEW", view })}
          onReset={handleReset}
        />
      )}
    </>
  );
}
