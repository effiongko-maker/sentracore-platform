import { type NextRequest } from "next/server";
import { buildContentSecurityPolicy, generateNonce } from "@/lib/security/securityHeaders";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Next.js 16 Proxy (formerly Middleware).
 * Refreshes Supabase Auth cookies, enforces the auth boundary, and applies a per-request nonce CSP.
 */
export async function proxy(request: NextRequest) {
  const contentSecurityPolicy = buildContentSecurityPolicy({
    nonce: generateNonce(),
    isDev: process.env.NODE_ENV === "development",
    supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL,
  });
  const response = await updateSession(request, contentSecurityPolicy);
  response.headers.set("Content-Security-Policy", contentSecurityPolicy);
  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and images.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
