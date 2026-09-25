import type { CommandCentreDecisionItem } from "@/modules/command-centre/presentationTypes";
import type { FinanceVendorBill } from "@/modules/platform-finance/domain/vendorBills";
import type {
  FinancialRequest,
  FinancialRequestCategory,
} from "@/modules/platform-finance/types";

type DecisionCandidate =
  | { source: "finance_request"; row: FinancialRequest }
  | { source: "vendor_bill"; row: FinanceVendorBill };

function formatAmount(amount: number, currency: string): string {
  if (!Number.isFinite(amount)) return "—";
  try {
    return new Intl.NumberFormat("en-NG", {
      style: "currency",
      currency: currency || "NGN",
      maximumFractionDigits: 0,
    }).format(amount);
  } catch {
    return `₦${amount.toLocaleString("en-NG", { maximumFractionDigits: 0 })}`;
  }
}

export function composeFinanceDecisionQueue(input: {
  requests: FinancialRequest[];
  vendorBills: FinanceVendorBill[];
  categories: FinancialRequestCategory[];
}): {
  items: CommandCentreDecisionItem[];
  totalsByCurrency: Map<string, number>;
} {
  const categoryById = new Map(input.categories.map((row) => [row.id, row.name]));
  const candidates: DecisionCandidate[] = [
    ...input.requests
      .filter((row) => row.status === "pending_ceo_approval")
      .map((row): DecisionCandidate => ({ source: "finance_request", row })),
    ...input.vendorBills
      .filter((row) => row.status === "pending_ceo_approval")
      .map((row): DecisionCandidate => ({ source: "vendor_bill", row })),
  ].sort((left, right) => {
    const byTime = left.row.updatedAt.localeCompare(right.row.updatedAt);
    if (byTime !== 0) return byTime;
    return `${left.source}:${left.row.id}`.localeCompare(
      `${right.source}:${right.row.id}`
    );
  });

  const totalsByCurrency = new Map<string, number>();
  const items = candidates.map((candidate): CommandCentreDecisionItem => {
    const currency = candidate.row.currency || "NGN";
    const amount = candidate.source === "finance_request"
      ? candidate.row.requestedAmount
      : candidate.row.billedAmount;
    totalsByCurrency.set(
      currency,
      (totalsByCurrency.get(currency) ?? 0) + amount
    );

    if (candidate.source === "finance_request") {
      return {
        id: `finance_request:${candidate.row.id}`,
        source: "finance_request",
        environment: "Finance",
        decisionLabel: "Financial Request",
        stateLabel: "Awaiting CEO approval",
        reason: "Finance review is complete; funding needs CEO approval.",
        submittedAt: candidate.row.submittedAt ?? null,
        title: candidate.row.purpose?.trim() || "Financial request",
        reference: candidate.row.externalReference,
        categoryLabel: categoryById.get(candidate.row.categoryId) ?? null,
        amountLabel: formatAmount(amount, currency),
        currency,
        href: `/platform-finance/requests/${candidate.row.id}`,
      };
    }

    return {
      id: `vendor_bill:${candidate.row.id}`,
      source: "vendor_bill",
      environment: "Finance",
      decisionLabel: "Vendor Bill",
      stateLabel: "Awaiting CEO approval",
      reason: "Finance review is complete; the supplier bill needs CEO approval.",
      submittedAt: candidate.row.submittedAt ?? null,
      title: candidate.row.purpose?.trim() || "Vendor bill",
      reference: candidate.row.invoiceReference,
      categoryLabel: candidate.row.payeeName?.trim() || null,
      amountLabel: formatAmount(amount, currency),
      currency,
      href: `/platform-finance/vendor-bills/${candidate.row.id}`,
    };
  });

  return { items, totalsByCurrency };
}

/**
 * Completeness of an actor's Finance decision view.
 *
 * The decision queue is narrowed by finance_company_access, while the organisation-wide Finance
 * pulse counts EVERY company. An empty visible queue therefore only means "nothing waiting" when
 * the actor's company access covers the whole organisation population (the same population the
 * pulse counts). Otherwise the view is PARTIAL and zero visible items proves nothing.
 */
export type DecisionScope = {
  complete: boolean;
  totalCompanies: number;
  accessibleCompanies: number;
  /** Organisation companies outside the actor's access. */
  uncoveredCompanies: number;
};

export function evaluateDecisionScope(
  organisationCompanyIds: readonly string[],
  accessibleCompanyIds: readonly string[]
): DecisionScope {
  const accessible = new Set(accessibleCompanyIds);
  const total = new Set(organisationCompanyIds);
  const uncovered = [...total].filter((id) => !accessible.has(id)).length;
  return {
    complete: uncovered === 0,
    totalCompanies: total.size,
    accessibleCompanies: total.size - uncovered,
    uncoveredCompanies: uncovered,
  };
}

export function decisionScopeNote(scope: DecisionScope): string | null {
  if (scope.complete) return null;
  if (scope.accessibleCompanies === 0) {
    return "You have no Finance company access, so no decisions can be shown to you here.";
  }
  return `Your Finance decision view is limited by company access (${scope.accessibleCompanies} of ${scope.totalCompanies} companies).`;
}
