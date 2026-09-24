import type { NextConfig } from "next";
import { staticSecurityHeaders } from "./src/lib/security/securityHeaders";

const nextConfig: NextConfig = {
  // The per-request nonce Content-Security-Policy is set in src/proxy.ts; these apply to every response.
  async headers() {
    return [{ source: "/:path*", headers: staticSecurityHeaders(process.env.NODE_ENV === "production") }];
  },
};

export default nextConfig;
