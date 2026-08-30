/**
 * Safe internal path helpers for auth redirects.
 * Rejects protocol-relative and open-redirect targets.
 */

const AUTH_LOOP_PREFIXES = [
  "/login",
  "/forgot-password",
  "/reset-password",
  "/auth/",
] as const;

export const PASSWORD_RECOVERY_COOKIE = "sc_password_recovery";
export const MIN_PASSWORD_LENGTH = 10;

/** Allow only same-origin relative paths; block auth-loop destinations. */
export function safeInternalPath(
  raw: string | null | undefined,
  fallback = "/"
): string {
  if (!raw) return fallback;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//")) return fallback;
  if (path.includes("access_token") || path.includes("refresh_token") || path.includes("%23")) {
    return fallback;
  }
  if (AUTH_LOOP_PREFIXES.some((prefix) => path === prefix || path.startsWith(prefix))) {
    return fallback;
  }
  return path;
}

/**
 * Application origin for Supabase redirectTo URLs.
 * Prefer explicit env; otherwise derive from request headers (dev + prod).
 */
export function resolveAppOrigin(headersList: Headers): string {
  const fromEnv = (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    ""
  ).trim().replace(/\/$/, "");
  if (fromEnv) return fromEnv;

  const host =
    headersList.get("x-forwarded-host") ||
    headersList.get("host") ||
    "localhost:3000";
  const proto =
    headersList.get("x-forwarded-proto") ||
    (host.includes("localhost") || host.startsWith("127.") ? "http" : "https");

  return `${proto}://${host}`.replace(/\/$/, "");
}
