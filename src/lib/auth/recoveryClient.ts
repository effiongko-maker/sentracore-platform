"use client";

import { createBrowserClient } from "@supabase/ssr";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

/**
 * Browser Supabase client for recovery/callback.
 * detectSessionInUrl is disabled so we can explicitly setSession from the hash
 * without racing the client's automatic URL detection (which was hanging the callback).
 */
export function createAuthBrowserClient() {
  return createBrowserClient(supabaseUrl, supabaseKey, {
    auth: {
      detectSessionInUrl: false,
    },
  });
}

/**
 * Request a recovery email WITHOUT starting a PKCE flow.
 *
 * @supabase/ssr defaults to PKCE, which stores a code_verifier cookie and sends
 * `?code=` links that fail when the email is opened in another browser/webview
 * (`pkce_code_verifier_not_found` → /forgot-password?error=expired).
 *
 * Calling GoTrue `/recover` directly (no code_challenge) makes Supabase redirect
 * with `#access_token=…&type=recovery`, which the callback can consume anywhere.
 */
export async function requestRecoveryEmail(email: string, redirectTo: string) {
  const res = await fetch(`${supabaseUrl}/auth/v1/recover`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
    },
    body: JSON.stringify({
      email,
      redirect_to: redirectTo,
    }),
  });

  if (!res.ok) {
    let message = `Recovery request failed (${res.status})`;
    try {
      const body = (await res.json()) as {
        msg?: string;
        error_description?: string;
      };
      message = body.msg || body.error_description || message;
    } catch {
      /* ignore */
    }
    const err = new Error(message) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
}
