import { postFinanceProxyWithProtection } from "@/lib/access/postFinanceProxyWithProtection";

/**
 * Writes require finance.pay.
 * Updates (corrections) require finance.payment.correct.
 */

export async function POST(request: Request) {
  return postFinanceProxyWithProtection({
    request,
    resource: "reimbursement-payments",
    logPrefix: "api/reimbursement-payments",
    writeCapability: "finance.pay",
    requireProtectedForActions: {
      update: "finance.payment.correct",
    },
  });
}
