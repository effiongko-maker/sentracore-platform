import { postGatedOperationalProxy } from "@/lib/access/postGatedOperationalProxy";

/**
 * Server-only proxy: browser → /api/master-data → Apps Script.
 * Reads: ops.view. Creates: ops.create. Updates/deactivates: ops.edit.
 *
 * Phase 1B keeps this on Apps Script. Location catalog is mixed with Vendors;
 * a split response must not look healthy if one source failed. Facilities SoT
 * is /api/facilities (Supabase). Bootstrap location catalog later.
 */

export async function POST(request: Request) {
  return postGatedOperationalProxy(request, "master-data", "api/master-data");
}
