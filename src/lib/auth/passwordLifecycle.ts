/**
 * Administrator-created accounts: the mandatory first-login password change.
 *
 * The state is a credential-lifecycle flag on the Supabase Auth user — `app_metadata.must_change_password`. It is:
 *   - writable ONLY with the service role (a user cannot edit their own app_metadata),
 *   - returned fresh by `auth.getUser()` on every request, so the proxy can enforce it without a database call,
 *   - NOT authorization: it grants and withdraws no capability, module or role. It only says "this credential is a
 *     temporary one; change it before doing anything else".
 * Existing users have no such key and are never affected.
 *
 * The temporary password itself is never stored anywhere: it exists in the Auth service (hashed) and, once, in the
 * response to the creating administrator.
 */
export const MUST_CHANGE_PASSWORD_KEY = "must_change_password";
export const CHANGE_PASSWORD_PATH = "/change-password";
export const PASSWORD_CHANGE_REQUIRED_CODE = "PASSWORD_CHANGE_REQUIRED";

export function mustChangePassword(
  user: { app_metadata?: Record<string, unknown> | null } | null | undefined
): boolean {
  return user?.app_metadata?.[MUST_CHANGE_PASSWORD_KEY] === true;
}

export type PasswordChangeGate =
  | { action: "allow" }
  | { action: "redirect"; to: typeof CHANGE_PASSWORD_PATH }
  | { action: "block_api"; code: typeof PASSWORD_CHANGE_REQUIRED_CODE };

/**
 * What the request boundary does with an authenticated user whose password change is pending. Pure, so the
 * enforcement rule is testable without a running proxy. Only the change page itself and the auth callback are
 * reachable; every other page redirects and every API call is refused.
 */
export function passwordChangeGate(pathname: string, pending: boolean): PasswordChangeGate {
  if (!pending) return { action: "allow" };
  if (pathname === CHANGE_PASSWORD_PATH || pathname === "/auth/callback") return { action: "allow" };
  if (pathname.startsWith("/api/")) return { action: "block_api", code: PASSWORD_CHANGE_REQUIRED_CODE };
  return { action: "redirect", to: CHANGE_PASSWORD_PATH };
}
