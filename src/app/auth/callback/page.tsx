import { AuthCallbackClient } from "@/components/auth/AuthCallbackClient";

/**
 * Shared Supabase Auth callback (PKCE).
 *
 * Handles password recovery, and is ready for invite / email verification
 * redirects that land with `?code=` or `#access_token` / `token_hash`.
 *
 * Prefer redirect_to = `{APP_ORIGIN}/auth/callback` (no query string) in
 * Supabase allowlists. Recovery still routes to /reset-password when
 * hash/query type=recovery.
 *
 * Supabase dashboard → Authentication → URL Configuration must include:
 * - Site URL: your deployed app origin (or http://localhost:3000 for local)
 * - Redirect URLs allowlist:
 *   - {APP_ORIGIN}/auth/callback
 *   - http://localhost:3000/auth/callback
 */
export default function AuthCallbackPage() {
  return <AuthCallbackClient />;
}
