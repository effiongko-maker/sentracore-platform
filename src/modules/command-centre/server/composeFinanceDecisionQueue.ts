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
        decisionLabel: "Financial Request",
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
      decisionLabel: "Vendor Bill",
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
