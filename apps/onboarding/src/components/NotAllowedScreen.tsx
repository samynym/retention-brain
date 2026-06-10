import { Brandmark } from "./Brandmark";

/** Legacy restricted-access state. Open registration should not route here. */
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
          Access is unavailable.
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
              signed in, but this workspace could not be activated. Try
              signing out and using a different email.
            </>
          ) : (
            <>This workspace could not be activated. Try signing in again.</>
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
