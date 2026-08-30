"use client";

import Link from "next/link";
import {
  useEffect,
  useState,
  useTransition,
  type FormEvent,
} from "react";
import {
  assertPasswordRecoveryContext,
  finalizePasswordReset,
} from "@/lib/auth/actions";
import { MIN_PASSWORD_LENGTH } from "@/lib/auth/urls";
import { createClient } from "@/utils/supabase/client";

type Gate = "loading" | "ok" | "invalid";

export function ResetPasswordForm({
  hasRecoveryCookie,
}: {
  hasRecoveryCookie: boolean;
}) {
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [gate, setGate] = useState<Gate>(() =>
    hasRecoveryCookie ? "loading" : "invalid"
  );

  useEffect(() => {
    if (!hasRecoveryCookie) {
      setGate("invalid");
      return;
    }

    let cancelled = false;
    const supabase = createClient();
    void supabase.auth.getUser().then(({ data: { user }, error: userError }) => {
      if (cancelled) return;
      if (userError || !user) {
        setGate("invalid");
        return;
      }
      setGate("ok");
    });

    return () => {
      cancelled = true;
    };
  }, [hasRecoveryCookie]);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    const form = event.currentTarget;
    const formData = new FormData(form);
    const password = String(formData.get("password") ?? "");
    const confirm = String(formData.get("confirmPassword") ?? "");

    if (password.length < MIN_PASSWORD_LENGTH) {
      setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
      return;
    }
    if (password !== confirm) {
      setError("Passwords do not match.");
      return;
    }

    startTransition(async () => {
      const gateResult = await assertPasswordRecoveryContext();
      if (gateResult.error) {
        setError(gateResult.error);
        setGate("invalid");
        return;
      }

      const supabase = createClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        console.error("[auth.updatePassword.client]", updateError);
        const message = updateError.message?.toLowerCase() ?? "";
        if (message.includes("same") || message.includes("different")) {
          setError("Choose a password that is different from your current one.");
          return;
        }
        if (message.includes("weak") || message.includes("least")) {
          setError(
            `Password must be at least ${MIN_PASSWORD_LENGTH} characters.`
          );
          return;
        }
        setError(
          "Unable to update your password. The reset link may have expired — please request a new one."
        );
        return;
      }

      await finalizePasswordReset();
      window.location.assign("/login?reset=success");
    });
  }

  if (gate === "loading") {
    return (
      <p className="text-sm text-muted" role="status">
        Verifying your reset link…
      </p>
    );
  }

  if (gate === "invalid") {
    return (
      <div className="space-y-4">
        <p
          role="alert"
          className="rounded-xl border border-danger/20 bg-danger/5 px-3 py-3 text-sm text-danger"
        >
          This password reset link is invalid or has expired. Please request a
          new one.
        </p>
        <Link
          href="/forgot-password"
          className="inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-white transition-opacity hover:opacity-95"
        >
          Request a new reset link
        </Link>
        <p className="text-center text-sm text-muted">
          <Link
            href="/login"
            className="font-medium text-primary underline-offset-2 hover:underline"
          >
            Back to Sign in
          </Link>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label
          htmlFor="password"
          className="block text-xs font-medium text-foreground"
        >
          New password
        </label>
        <div className="relative">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="new-password"
            required
            minLength={MIN_PASSWORD_LENGTH}
            className="h-11 w-full rounded-xl border border-border bg-card px-3 pr-16 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-accent/30"
            placeholder="••••••••"
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute inset-y-0 right-0 px-3 text-xs font-medium text-muted hover:text-foreground"
            aria-pressed={showPassword}
          >
            {showPassword ? "Hide" : "Show"}
          </button>
        </div>
        <p className="text-xs text-muted">
          At least {MIN_PASSWORD_LENGTH} characters.
        </p>
      </div>

      <div className="space-y-1.5">
        <label
          htmlFor="confirmPassword"
          className="block text-xs font-medium text-foreground"
        >
          Confirm new password
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          required
          minLength={MIN_PASSWORD_LENGTH}
          className="h-11 w-full rounded-xl border border-border bg-card px-3 text-sm text-foreground outline-none transition-shadow focus:ring-2 focus:ring-accent/30"
          placeholder="••••••••"
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
        {pending ? "Saving…" : "Set new password"}
      </button>
    </form>
  );
}
