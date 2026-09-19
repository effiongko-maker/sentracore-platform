import { handleFmLogRoute } from "@/modules/operational-logs/server/fmLogRoute";

/**
 * FM energy-reading persistence is Supabase. Compatibility route: /api/energy-reading.
 * No Apps Script call. Reads: ops.view. Creates: ops.create. Updates: ops.edit.
 */
export async function POST(request: Request) {
  return handleFmLogRoute(request, "energy-reading");
}
