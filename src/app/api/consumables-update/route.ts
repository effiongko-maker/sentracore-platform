import { handleFmLogRoute } from "@/modules/operational-logs/server/fmLogRoute";

/**
 * FM consumables-update persistence is Supabase. Compatibility route: /api/consumables-update.
 * No Apps Script call. Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */
export async function POST(request: Request) {
  return handleFmLogRoute(request, "consumables-update");
}
