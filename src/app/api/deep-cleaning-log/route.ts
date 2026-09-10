import { postGatedOperationalProxy } from "@/lib/access/postGatedOperationalProxy";

/**
 * Server-only proxy: browser → /api/deep-cleaning-log → Apps Script.
 * Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */

export async function POST(request: Request) {
  return postGatedOperationalProxy(
    request,
    "deep-cleaning-log",
    "api/deep-cleaning-log"
  );
}
