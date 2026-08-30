"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { requestRecoveryEmail } from "@/lib/auth/recoveryClient";

export function ForgotPasswordForm() {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const email = String(new FormData(event.currentTarget).get("email") ?? "")
      .trim()
      .toLowerCase();

    if (!email || !email.includes("@")) {
      setError("Enter a valid email address.");
      return;
    }

    startTransition(async () => {
      try {
        const origin = window.location.origin;
        // Keep redirect_to free of query strings so Supabase allowlists match
        // reliably (Site URL fallback was sending tokens to `/#…` instead of
        // `/auth/callback?next=…#…`).
        const redirectTo = `${origin}/auth/callback`;
        await requestRecoveryEmail(email, redirectTo);
        setSubmitted(true);
      } catch (err) {
        const message =
          err instanceof Error ? err.message.toLowerCase() : "";
        const status =
          err && typeof err === "object" && "status" in err
            ? Number((err as { status?: number }).status)
            : 0;

        console.error("[auth.requestRecoveryEmail]", err);

        const isTransport =
          message.includes("fetch") ||
          message.includes("network") ||
          message.includes("timeout") ||
          status >= 500;

        if (isTransport) {
          setError(
            "Unable to reach the authentication service. Please try again in a moment."
          );
          return;
        }

        // Rate limits and unknown-account responses: still show neutral success
        // so we do not leak whether the email exists (except hard transport failures).
        if (status === 429) {
          setSubmitted(true);
          return;
        }

        setSubmitted(true);
      }
    });
  }

  if (submitted) {
    return (
      <div className="space-y-4">
        <p
          role="status"
          className="rounded-xl border border-border bg-background/60 px-3 py-3 text-sm text-foreground"
        >
          If an account exists for this email address, we’ll send you a password
          reset link.
        </p>
        <Link
          href="/login"
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white transition-opacity hover:opacity-95"
        >
          Back to Sign in
        </Link>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
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

      {error ? (
        <p
          role="alert"
          className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-2 text-sm text-danger"
        >
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={pending}
        className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white transition-opacity hover:opacity-95 disabled:cursor-not-allowed disabled:opacity-60"
      >
        {pending ? "Sending…" : "Send reset link"}
      </button>

      <p className="text-center text-sm text-muted">
        <Link
          href="/login"
          className="font-medium text-primary underline-offset-2 hover:underline"
        >
          Back to Sign in
        </Link>
      </p>
    </form>
  );
}
