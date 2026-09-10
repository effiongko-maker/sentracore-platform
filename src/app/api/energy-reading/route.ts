import { postGatedOperationalProxy } from "@/lib/access/postGatedOperationalProxy";

/**
 * Server-only proxy: browser → /api/energy-reading → Apps Script.
 * Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */

export async function POST(request: Request) {
  return postGatedOperationalProxy(
    request,
    "energy-reading",
    "api/energy-reading"
  );
}
