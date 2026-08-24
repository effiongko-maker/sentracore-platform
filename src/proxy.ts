import { type NextRequest } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

/**
 * Next.js 16 Proxy (formerly Middleware).
 * Refreshes Supabase Auth cookies and enforces the auth boundary.
 */
export async function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Match all request paths except static assets and images.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
