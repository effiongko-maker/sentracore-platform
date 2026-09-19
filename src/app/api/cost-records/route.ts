import { handleFmCostRoute } from "@/modules/finance/server/fmCostRoute";

/**
 * FM Cost Records (operational, not Platform Finance) persistence is Supabase. Compatibility route: /api/cost-records.
 * No Apps Script call. Reads: finance.view. Writes: finance.create.
 */
export async function POST(request: Request) {
  return handleFmCostRoute({
    request,
    resource: "cost-records",
    writeCapability: "finance.create",
  });
}
