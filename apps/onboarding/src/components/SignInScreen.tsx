import { useState } from "react";
import { supabase } from "../lib/supabase";
import { Brandmark } from "./Brandmark";

/**
 * Real entry gate: Supabase magic-link. The dev enters their email, gets a
 * sign-in link, and lands back signed in. OAuth (no separate password) — and
 * the backend enforces an invite allowlist, so only invited emails get in.
 */
export function SignInScreen() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "error">("idle");
  const [error, setError] = useState("");

  async function sendLink() {
    const addr = email.trim();
    if (!addr || state === "sending") return;
    setState("sending");
    setError("");
    const { error } = await supabase.auth.signInWithOtp({
      email: addr,
      options: { emailRedirectTo: window.location.origin },
    });
    if (error) {
      setError(error.message);
      setState("error");
    } else {
      setState("sent");
    }
  }

  return (
    <div className="paper-grain flex min-h-full items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Brandmark />

        <h1 className="rise mt-9 font-display text-[34px] leading-[1.08] font-medium tracking-[-0.02em]">
          See who's about to churn
          <span style={{ color: "var(--color-accent)" }}> in your app.</span>
        </h1>
        <p
          className="rise mt-3 text-[14.5px] leading-relaxed"
          style={{ color: "var(--color-ink-soft)", animationDelay: "70ms" }}
        >
          Read-only. We never send anything to your users.
        </p>

        {state === "sent" ? (
          <div
            className="rise mt-9 w-full rounded-lg border px-5 py-6"
            style={{
              borderColor: "var(--color-line-strong)",
              backgroundColor: "var(--color-raised)",
              animationDelay: "140ms",
            }}
          >
            <p className="text-[15px] font-semibold">Check your inbox.</p>
            <p className="mt-1.5 text-[13.5px] leading-snug" style={{ color: "var(--color-ink-soft)" }}>
              We sent a sign-in link to{" "}
              <span className="font-medium" style={{ color: "var(--color-ink)" }}>
                {email.trim()}
              </span>
              . Open it on this device to continue.
            </p>
            <button
              type="button"
              onClick={() => setState("idle")}
              className="mt-4 font-mono text-[11px] tracking-[0.04em] uppercase"
              style={{ color: "var(--color-accent)" }}
            >
              Use a different email
            </button>
          </div>
        ) : (
          <div className="rise mt-9 flex w-full flex-col gap-2.5" style={{ animationDelay: "140ms" }}>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendLink()}
              placeholder="you@yourcompany.com"
              autoComplete="email"
              autoFocus
              className="w-full rounded-md border bg-transparent px-4 py-3 text-[15px] focus:outline-none"
              style={{ borderColor: "var(--color-line-strong)", color: "var(--color-ink)" }}
            />
            <button
              type="button"
              onClick={sendLink}
              disabled={state === "sending" || email.trim().length === 0}
              className="btn btn-primary px-5 py-3 text-[14.5px]"
            >
              {state === "sending" ? "Sending…" : "Email me a sign-in link"}
            </button>
            {state === "error" && (
              <p className="text-[12.5px]" style={{ color: "var(--color-risk-high)" }}>
                {error}
              </p>
            )}
          </div>
        )}

        <p
          className="rise mt-7 max-w-xs text-[12.5px] leading-snug"
          style={{ color: "var(--color-ink-faint)", animationDelay: "210ms" }}
        >
          Invite-only during the beta — sign-in is restricted to allowlisted
          team emails.
        </p>
      </div>
    </div>
  );
}
