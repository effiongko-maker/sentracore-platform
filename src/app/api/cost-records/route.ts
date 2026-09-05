import { postFinanceProxyWithProtection } from "@/lib/access/postFinanceProxyWithProtection";

/**
 * Server-only proxy: browser → /api/cost-records → Apps Script.
 * Writes require finance.create.
 * Locked-cost unlock requires finance.cost.unlock_edit (+ FM step-up / SA override).
 */

export async function POST(request: Request) {
  return postFinanceProxyWithProtection({
    request,
    resource: "cost-records",
    logPrefix: "api/cost-records",
    writeCapability: "finance.create",
  });
}
