"use client";

import { useActionState, useState } from "react";
import { completeMandatoryPasswordChange, signOut, type ChangePasswordState } from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/urls";

const initialState: ChangePasswordState = {};

/** The dedicated mandatory first-login password change. No other route is reachable until it succeeds. */
export function ChangePasswordForm() {
  const [state, formAction, pending] = useActionState(completeMandatoryPasswordChange, initialState);
  const [show, setShow] = useState(false);
  const type = show ? "text" : "password";
  const input = "h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-accent/30";

  return (
    <div className="space-y-4">
      <form action={formAction} className="space-y-4">
        <div className="space-y-1.5">
          <label htmlFor="password" className="block text-xs font-medium text-foreground">New password</label>
          <input id="password" name="password" type={type} autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} className={input} />
          <p className="text-xs text-muted">At least {MIN_PASSWORD_LENGTH} characters. It must differ from your temporary password.</p>
        </div>
        <div className="space-y-1.5">
          <label htmlFor="confirmPassword" className="block text-xs font-medium text-foreground">Confirm new password</label>
          <input id="confirmPassword" name="confirmPassword" type={type} autoComplete="new-password" required minLength={MIN_PASSWORD_LENGTH} className={input} />
        </div>
        <label className="flex items-center gap-2 text-xs text-muted">
          <input type="checkbox" checked={show} onChange={(e) => setShow(e.target.checked)} /> Show passwords
        </label>
        {state.error ? (
          <p role="alert" className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger">{state.error}</p>
        ) : null}
        <button type="submit" disabled={pending} className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:opacity-60">
          {pending ? "Saving…" : "Set password and continue"}
        </button>
      </form>
      <form action={signOut}>
        <button type="submit" className="w-full text-center text-sm font-medium text-muted underline-offset-2 hover:underline">Sign out</button>
      </form>
    </div>
  );
}
