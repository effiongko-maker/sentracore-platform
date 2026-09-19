import { handleFmLogRoute } from "@/modules/operational-logs/server/fmLogRoute";

/**
 * FM fumigation-log persistence is Supabase. Compatibility route: /api/fumigation-log.
 * No Apps Script call. Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */
export async function POST(request: Request) {
  return handleFmLogRoute(request, "fumigation-log");
}
