import { postFinanceProxyWithProtection } from "@/lib/access/postFinanceProxyWithProtection";

/**
 * Writes require finance.authorize.
 * Updates (revise) require finance.authorization.revise.
 */

export async function POST(request: Request) {
  return postFinanceProxyWithProtection({
    request,
    resource: "reimbursement-authorizations",
    logPrefix: "api/reimbursement-authorizations",
    writeCapability: "finance.authorize",
    requireProtectedForActions: {
      update: "finance.authorization.revise",
    },
  });
}
