import { handleFmCostRoute } from "@/modules/finance/server/fmCostRoute";

/**
 * FM Reimbursement Authorizations persistence is Supabase. Compatibility route: /api/reimbursement-authorizations.
 * No Apps Script call. Reads: finance.view. Writes: finance.authorize.
 */
export async function POST(request: Request) {
  return handleFmCostRoute({
    request,
    resource: "reimbursement-authorizations",
    writeCapability: "finance.authorize",
  });
}
