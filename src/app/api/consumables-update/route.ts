import { postGatedOperationalProxy } from "@/lib/access/postGatedOperationalProxy";

/**
 * Server-only proxy: browser → /api/consumables-update → Apps Script.
 * Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */

export async function POST(request: Request) {
  return postGatedOperationalProxy(
    request,
    "consumables-update",
    "api/consumables-update"
  );
}
