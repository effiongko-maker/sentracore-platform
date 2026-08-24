"use client";

import { useActionState } from "react";
import { signIn, type SignInState } from "@/lib/auth/actions";

const initialState: SignInState = {};

export function LoginForm({ nextPath }: { nextPath: string }) {
  const [state, formAction, pending] = useActionState(signIn, initialState);

  return (
    <form action={formAction} className="space-y-4">
      <input type="hidden" name="next" value={nextPath} />

      <div className="space-y-1.5">
        <label
          htmlFor="email"
          className="block text-xs font-medium text-foreground"
        >
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-accent/30"
          placeholder="you@organisation.com"
        />
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-xs font-medium text-foreground"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-accent/30"
          placeholder="••••••••"
        />
      </div>

      {state.error ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {state.error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
