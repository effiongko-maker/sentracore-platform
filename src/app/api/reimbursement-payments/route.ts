import { handleFmCostRoute } from "@/modules/finance/server/fmCostRoute";

/**
 * FM Reimbursement Payments (receipts) persistence is Supabase. Compatibility route: /api/reimbursement-payments.
 * No Apps Script call. Reads: finance.view. Writes: finance.pay.
 */
export async function POST(request: Request) {
  return handleFmCostRoute({
    request,
    resource: "reimbursement-payments",
    writeCapability: "finance.pay",
  });
}
