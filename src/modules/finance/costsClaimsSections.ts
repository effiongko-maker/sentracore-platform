/**
 * Costs & Claims — the five operational areas under one FM parent. One definition feeds the sidebar sub-navigation
 * and the in-page context line, so both always agree. Each area keeps its existing route, records and access gate;
 * nothing here merges records (Payment Approvals and Pending Payments stay separate domains).
 */
import type { AccessCapability } from "@/lib/access/capabilities";

export type CostsClaimsAreaId = "costs" | "payment-approvals" | "pending-payments" | "contract-payments" | "reimbursements";

export type CostsClaimsArea = {
  id: CostsClaimsAreaId;
  label: string;
  href: string;
  capability: AccessCapability;
};

export const COSTS_CLAIMS_LABEL = "Costs & Claims";
export const COSTS_CLAIMS_HOME = "/finance";

export const COSTS_CLAIMS_AREAS: readonly CostsClaimsArea[] = [
  { id: "costs", label: "Costs", href: "/finance/costs", capability: "finance.view" },
  { id: "payment-approvals", label: "Payment Approvals", href: "/approvals", capability: "ops.view" },
  { id: "pending-payments", label: "Pending Payments", href: "/finance/submissions", capability: "finance.view" },
  { id: "contract-payments", label: "Contract Payments", href: "/finance/submissions?kind=contract_instalment", capability: "finance.view" },
  { id: "reimbursements", label: "Reimbursements", href: "/finance/submissions?kind=reimbursement_claim", capability: "finance.view" },
];

/** True for every route that belongs to Costs & Claims (the parent overview and all five areas). */
export function isCostsClaimsPath(pathname: string): boolean {
  return pathname === COSTS_CLAIMS_HOME || pathname.startsWith(`${COSTS_CLAIMS_HOME}/`) || pathname === "/approvals" || pathname.startsWith("/approvals/");
}

/**
 * The active area for a route. `kind` is the Pending Payments type query (list pages); `recordKind` is a record's own
 * type on a detail page (e.g. a contract instalment opened by deep link). null = the Costs & Claims overview.
 */
export function activeCostsClaimsArea(
  pathname: string,
  kind?: string | null,
  recordKind?: string | null
): CostsClaimsAreaId | null {
  if (pathname === "/approvals" || pathname.startsWith("/approvals/")) return "payment-approvals";
  if (pathname.startsWith("/finance/costs")) return "costs";
  if (pathname.startsWith("/finance/monthly-payments")) return "contract-payments";
  if (pathname.startsWith("/finance/submissions") || pathname.startsWith("/finance/client-payments")) {
    const effective = recordKind ?? kind;
    if (effective === "contract_instalment") return "contract-payments";
    if (effective === "reimbursement_claim") return "reimbursements";
    // Claim editing routes belong to Reimbursements.
    if (/^\/finance\/submissions\/(new|[^/]+\/edit)/.test(pathname) && !recordKind) return "reimbursements";
    return "pending-payments";
  }
  return null;
}
