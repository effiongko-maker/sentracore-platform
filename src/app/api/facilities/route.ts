import { postGatedOperationalProxy } from "@/lib/access/postGatedOperationalProxy";

/**
 * Server-only proxy: browser → /api/facilities → Apps Script.
 * Reads: ops.view. Creates: ops.create. Updates/deactivates: ops.edit.
 */

export async function POST(request: Request) {
  return postGatedOperationalProxy(request, "facilities", "api/facilities");
}
