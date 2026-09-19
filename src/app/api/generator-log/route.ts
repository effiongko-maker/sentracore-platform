import { handleFmLogRoute } from "@/modules/operational-logs/server/fmLogRoute";

/**
 * FM generator-log persistence is Supabase. Compatibility route: /api/generator-log.
 * No Apps Script call. Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */
export async function POST(request: Request) {
  return handleFmLogRoute(request, "generator-log");
}
