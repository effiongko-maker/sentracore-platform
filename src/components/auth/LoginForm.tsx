"use client";

import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";
import { useActionState, useState } from "react";
import { signIn, type SignInState } from "@/lib/auth/actions";

const initialState: SignInState = {};

export function LoginForm({
  nextPath,
  resetSuccess = false,
}: {
  nextPath: string;
  resetSuccess?: boolean;
}) {
  const [state, formAction, pending] = useActionState(signIn, initialState);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <form action={formAction} className="login-form">
      <input type="hidden" name="next" value={nextPath} />

      {resetSuccess ? (
        <p role="status" className="login-status">
          Your password was updated. Sign in with your new password.
        </p>
      ) : null}

      <div className="login-field">
        <label htmlFor="email" className="login-label">
          Work email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          className="login-input"
          placeholder="name@organisation.com"
        />
      </div>

      <div className="login-field">
        <label htmlFor="password" className="login-label">
          Password
        </label>
        <div className="login-input-wrap">
          <input
            id="password"
            name="password"
            type={showPassword ? "text" : "password"}
            autoComplete="current-password"
            required
            className="login-input login-input--password"
            placeholder="Enter your password"
          />
          <button
            type="button"
            className="login-password-toggle"
            aria-label={showPassword ? "Hide password" : "Show password"}
            onClick={() => setShowPassword((value) => !value)}
          >
            {showPassword ? (
              <EyeOff className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            ) : (
              <Eye className="h-4 w-4" strokeWidth={1.75} aria-hidden />
            )}
          </button>
        </div>
      </div>

      <div className="login-form-row">
        <Link href="/forgot-password" className="login-forgot">
          Forgot password?
        </Link>
      </div>

      {state.error ? (
        <p role="alert" className="login-alert">
          {state.error}
        </p>
      ) : null}

      <button type="submit" disabled={pending} className="login-submit">
        {pending ? "Signing in…" : "Sign in"}
      </button>
    </form>
  );
}
