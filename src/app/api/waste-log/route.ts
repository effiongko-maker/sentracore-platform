import { handleFmLogRoute } from "@/modules/operational-logs/server/fmLogRoute";

/**
 * FM waste-log persistence is Supabase. Compatibility route: /api/waste-log.
 * No Apps Script call. Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */
export async function POST(request: Request) {
  return handleFmLogRoute(request, "waste-log");
}
