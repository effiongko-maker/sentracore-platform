/**
 * SentraCore browser security baseline.
 *
 * Private Office decrypts financial records inside the browser, so the integrity of the code running on our
 * origin is part of its confidentiality. The baseline therefore restricts SCRIPT execution strictly — per-request
 * nonce + 'strict-dynamic', no inline or third-party script, no eval in production — while staying realistic for
 * the rest of SentraCore:
 *   - styles allow 'unsafe-inline' because React style attributes / animation libraries set inline styles
 *     (a nonce cannot cover style attributes, and CSP ignores 'unsafe-inline' when a nonce is present);
 *   - images/fonts allow data:/blob: for PDF/image export and self-hosted fonts;
 *   - the browser talks only to our origin and Supabase Auth.
 * Verified against the app: no inline scripts, no third-party scripts, no iframes, no realtime channels.
 */

export function buildContentSecurityPolicy(options: { nonce: string; isDev: boolean; supabaseUrl?: string | null }): string {
  let supabase = "";
  let supabaseWs = "";
  if (options.supabaseUrl) {
    try {
      const url = new URL(options.supabaseUrl);
      supabase = url.origin;
      supabaseWs = `${url.protocol === "https:" ? "wss:" : "ws:"}//${url.host}`;
    } catch {
      // Misconfigured URL: leave Supabase out; auth calls will fail visibly rather than widening the policy.
    }
  }
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'nonce-${options.nonce}' 'strict-dynamic'${options.isDev ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `img-src 'self' blob: data:${supabase ? ` ${supabase}` : ""}`,
    "font-src 'self' data:",
    `connect-src 'self'${supabase ? ` ${supabase} ${supabaseWs}` : ""}${options.isDev ? " ws: wss:" : ""}`,
    "worker-src 'self' blob:",
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    ...(options.isDev ? [] : ["upgrade-insecure-requests"]),
  ];
  return directives.join("; ");
}

/** Static headers for every response (set in next.config.ts). */
export function staticSecurityHeaders(isProduction: boolean): Array<{ key: string; value: string }> {
  return [
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=(), serial=(), hid=(), bluetooth=(), publickey-credentials-get=(self), publickey-credentials-create=(self)",
    },
    ...(isProduction ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
  ];
}

export function generateNonce(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(18));
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}
