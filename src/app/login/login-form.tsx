"use client";

import { useActionState } from "react";
import { signIn, type LoginState } from "./actions";

const initialState: LoginState = { error: null };

export function LoginForm() {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="email"
          className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]"
        >
          Operator Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="h-10 rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)] px-3 text-sm text-[color:var(--color-text-primary)] outline-none transition focus:border-[color:var(--color-neon-green)] focus:shadow-[0_0_0_1px_var(--color-neon-green-dim)]"
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label
          htmlFor="password"
          className="text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-muted)]"
        >
          Access Code
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="h-10 rounded-md border border-[color:var(--color-border-base)] bg-[color:var(--color-bg-base)] px-3 text-sm text-[color:var(--color-text-primary)] outline-none transition focus:border-[color:var(--color-neon-green)] focus:shadow-[0_0_0_1px_var(--color-neon-green-dim)]"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-md border border-[color:var(--color-neon-red)]/40 bg-[color:var(--color-neon-red)]/10 px-3 py-2 text-xs text-[color:var(--color-neon-red)]"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="mt-2 h-11 rounded-md border border-[color:var(--color-neon-green)] bg-[color:var(--color-neon-green)]/10 text-sm font-semibold uppercase tracking-[0.22em] text-[color:var(--color-neon-green)] transition hover:bg-[color:var(--color-neon-green)]/20 hover:shadow-[0_0_24px_var(--color-neon-green-dim)] focus:outline-none focus:shadow-[0_0_24px_var(--color-neon-green-dim)] disabled:opacity-60"
      >
        {pending ? "Authenticating…" : "Enter the War Room"}
      </button>
    </form>
  );
}
