"use client";

import { useEffect, useState } from "react";
import type { EmailOtpType } from "@supabase/supabase-js";
import { createAuthBrowserClient } from "@/lib/auth/recoveryClient";
import { markPasswordRecovery } from "@/lib/auth/recoveryGate";
import { safeInternalPath } from "@/lib/auth/urls";

/**
 * Client auth callback.
 *
 * Handles the formats Supabase actually sends for recovery:
 * 1) Implicit hash: #access_token=…&refresh_token=…&type=recovery
 * 2) PKCE query: ?code=…
 * 3) Token hash: ?token_hash=…&type=recovery
 *
 * Server Route Handlers cannot read URL hash fragments.
 */
export function AuthCallbackClient() {
  const [message, setMessage] = useState("Completing sign-in…");

  useEffect(() => {
    let cancelled = false;

    async function run() {
      const url = new URL(window.location.href);
      const code = url.searchParams.get("code");
      const tokenHash = url.searchParams.get("token_hash");
      const type = url.searchParams.get("type");
      const errorDescription =
        url.searchParams.get("error_description") ||
        url.searchParams.get("error");
      const rawNext = url.searchParams.get("next");

      if (errorDescription) {
        window.location.replace("/forgot-password?error=expired");
        return;
      }

      const hashParams = new URLSearchParams(
        url.hash.startsWith("#") ? url.hash.slice(1) : url.hash
      );
      const accessToken = hashParams.get("access_token");
      const refreshToken = hashParams.get("refresh_token");
      const hashType = hashParams.get("type");

      const isRecovery =
        type === "recovery" ||
        hashType === "recovery" ||
        rawNext === "/reset-password";

      const supabase = createAuthBrowserClient();

      try {
        if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (error) throw error;
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) throw error;
        } else if (tokenHash && type) {
          const { error } = await supabase.auth.verifyOtp({
            type: type as EmailOtpType,
            token_hash: tokenHash,
          });
          if (error) throw error;
        } else {
          window.location.replace("/login");
          return;
        }

        if (cancelled) return;

        if (isRecovery) {
          await markPasswordRecovery();
          window.location.replace("/reset-password");
          return;
        }

        const next = safeInternalPath(rawNext, "/");
        window.location.replace(next);
      } catch (err) {
        console.error("[auth.callback.client]", err);
        if (!cancelled) {
          setMessage("This link is invalid or has expired.");
          window.location.replace("/forgot-password?error=expired");
        }
      }
    }

    void run();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <p className="text-sm text-muted" role="status">
        {message}
      </p>
    </div>
  );
}
