import { postGatedOperationalProxy } from "@/lib/access/postGatedOperationalProxy";

/**
 * Server-only proxy: browser → /api/generator-log → Apps Script.
 * Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */

export async function POST(request: Request) {
  return postGatedOperationalProxy(
    request,
    "generator-log",
    "api/generator-log"
  );
}
