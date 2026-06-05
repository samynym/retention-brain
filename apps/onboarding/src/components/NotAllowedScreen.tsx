import { Brandmark } from "./Brandmark";

/** Signed in, but the email isn't on the beta allowlist. */
export function NotAllowedScreen({
  email,
  onSignOut,
}: {
  email: string;
  onSignOut: () => void;
}) {
  return (
    <div className="paper-grain flex min-h-full items-center justify-center px-6">
      <div className="flex w-full max-w-sm flex-col items-center text-center">
        <Brandmark />
        <h1 className="rise mt-9 font-display text-[30px] leading-tight font-medium tracking-[-0.01em]">
          You're not on the list yet.
        </h1>
        <p
          className="rise mt-3 text-[14px] leading-relaxed"
          style={{ color: "var(--color-ink-soft)", animationDelay: "70ms" }}
        >
          {email ? (
            <>
              <span className="font-medium" style={{ color: "var(--color-ink)" }}>
                {email}
              </span>{" "}
              isn't on the beta allowlist. retention-brain is invite-only right
              now — ping us to get added.
            </>
          ) : (
            <>This email isn't on the beta allowlist. retention-brain is invite-only right now.</>
          )}
        </p>
        <button
          type="button"
          onClick={onSignOut}
          className="btn btn-secondary rise mt-7 px-5 py-2.5 text-[13.5px]"
          style={{ animationDelay: "140ms" }}
        >
          Sign out
        </button>
      </div>
    </div>
  );
}
