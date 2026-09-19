import { handleFmCostRoute } from "@/modules/finance/server/fmCostRoute";

/**
 * FM Cost Submissions (claims) persistence is Supabase. Compatibility route: /api/cost-submissions.
 * No Apps Script call. Reads: finance.view. Writes: finance.create.
 */
export async function POST(request: Request) {
  return handleFmCostRoute({
    request,
    resource: "cost-submissions",
    writeCapability: "finance.create",
    submitCapability: "finance.submit",
  });
}
