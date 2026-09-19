import { handleFmLogRoute } from "@/modules/operational-logs/server/fmLogRoute";

/**
 * FM diesel-usage persistence is Supabase. Compatibility route: /api/diesel-usage.
 * No Apps Script call. Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */
export async function POST(request: Request) {
  return handleFmLogRoute(request, "diesel-usage");
}
