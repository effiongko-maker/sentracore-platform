import { handleFmLogRoute } from "@/modules/operational-logs/server/fmLogRoute";

/**
 * FM deep-cleaning-log persistence is Supabase. Compatibility route: /api/deep-cleaning-log.
 * No Apps Script call. Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */
export async function POST(request: Request) {
  return handleFmLogRoute(request, "deep-cleaning-log");
}
