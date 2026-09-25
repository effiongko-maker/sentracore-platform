/**
 * Review & Post — shared vocabulary for every source event that reaches the Journal through Finance review.
 *
 * source event → proposed accounting treatment (a draft finance_transactions row) → Finance review →
 * canonical posting engine (finance_post_transaction). Accounting status is always DERIVED from the transaction and
 * its journal entry — never stored on, or inferred from, the operational record (approved ≠ recognised, paid ≠ posted).
 *
 * The database is authoritative for every rule below; these mirrors exist so the UI can explain, not decide.
 */
import type { FinanceAccount } from "@/modules/platform-finance/types";

export type AccountingReviewSourceType = "vendor_bill" | "payment";
export type AccountingReviewStatus = "pending" | "draft" | "posted";

export type AccountingTreatmentLine = {
  side: "debit" | "credit";
  account: { id: string; code: string; name: string } | null;
  /** Who decides this side: the reviewer (within eligibility), or the system from authoritative relationships. */
  determinedBy: "reviewer" | "system";
};

/** One row of the unified Review & Post work list. */
export type AccountingReviewWorkItem = {
  sourceType: AccountingReviewSourceType;
  sourceId: string;
  sourceLabel: string;
  sourceHref: string;
  counterparty: string;
  reference: string | null;
  accountingDate: string;
  amount: number;
  currency: string;
  companyId: string;
  proposedDebit: AccountingTreatmentLine;
  proposedCredit: AccountingTreatmentLine;
  status: AccountingReviewStatus;
  /** Null when posting can proceed; otherwise an explicit, actionable reason. */
  blockingReason: string | null;
  transactionId: string | null;
  journalEntryId: string | null;
};

/** Supplier bill review: every operational fact is prefilled; only the debit classification is reviewed. */
export type SupplierBillAccountingReview = {
  status: AccountingReviewStatus;
  vendorBill: {
    id: string;
    payeeName: string;
    payeeType: string;
    invoiceReference: string | null;
    invoiceDate: string | null;
    purpose: string;
    description: string | null;
    projectContractRef: string | null;
    goodsServicesReceived: boolean;
    billedAmount: number;
    approvedAmount: number;
    status: string;
  };
  payable: { id: string; status: string; payableAmount: number; paidAmount: number };
  companyName: string;
  currency: string;
  amount: number;
  transactionId: string | null;
  debitAccount: FinanceAccount | null;
  creditAccount: FinanceAccount | null;
  /** Accounts the database will accept as the debit (Expense / Asset / Prepayment; no control accounts). */
  eligibleDebitAccounts: Array<{ id: string; code: string; name: string; accountType: string; classification: string | null }>;
  period: { id: string; year: number; month: number } | null;
  blockingReason: string | null;
  journalEntryId: string | null;
};

// ── Source descriptors (provenance) ────────────────────────────────────────────────────────────────────────

const SOURCE_LABELS: Record<string, string> = {
  vendor_bill: "Supplier bill",
  payment: "Supplier payment",
  invoice: "Sales invoice",
  receipt: "Customer receipt",
  financial_account_opening_position: "Opening position",
  manual_journal: "Manual journal",
};

/** Label and link for the record a journal came from — by source_type, never by transaction_type. */
export function journalSourceDescriptor(input: { sourceType: string | null; sourceId: string | null; payableId: string | null }): {
  label: string;
  href: string | null;
} {
  const type = input.sourceType ?? "";
  const label = SOURCE_LABELS[type] ?? (type ? type.replace(/_/g, " ") : "Unknown source");
  const id = input.sourceId ? encodeURIComponent(input.sourceId) : null;
  switch (type) {
    case "vendor_bill":
      return { label, href: id ? `/platform-finance/vendor-bills/${id}` : null };
    case "payment":
      return { label, href: input.payableId ? `/platform-finance/payables/${encodeURIComponent(input.payableId)}` : null };
    case "invoice":
      return { label, href: id ? `/platform-finance/invoices/${id}` : null };
    case "receipt":
      // The Receipts register has no per-receipt route; link to the register rather than invent a deep link.
      return { label, href: "/platform-finance/receipts" };
    case "financial_account_opening_position":
      return { label, href: "/platform-finance/cash-banks" };
    default:
      return { label, href: null };
  }
}

export function sourceTypeLabel(sourceType: string | null): string {
  return journalSourceDescriptor({ sourceType, sourceId: null, payableId: null }).label;
}

// ── Supplier accrual rules (mirrors of the database functions) ─────────────────────────────────────────────

export const AP_CONTROL_CODE = "2000";
export const AR_CONTROL_CODE = "1070";

/** Mirrors finance_supplier_bill_debit_account_eligible. */
export function isSupplierBillDebitEligible(
  account: Pick<FinanceAccount, "status" | "accountType" | "classification" | "code">,
  cashBankControlAccountIds: ReadonlySet<string> = new Set(),
  accountId?: string
): boolean {
  if (account.status !== "active") return false;
  if (account.code === AR_CONTROL_CODE) return false;
  if (accountId && cashBankControlAccountIds.has(accountId)) return false;
  if (account.accountType === "expense") return true;
  return account.accountType === "asset" && (account.classification === "current_asset" || account.classification === "non_current_asset");
}

export const SUPPLIER_BILL_NO_INVOICE_DATE_REASON =
  "The supplier's invoice date is not recorded on this vendor bill, so its accounting date cannot be determined. It cannot be recognised until that is resolved.";
export const SUPPLIER_BILL_NO_OBLIGATION_REASON =
  "No supplier obligation (Payable) exists for this vendor bill.";
export const SUPPLIER_BILL_PERIOD_MISSING_REASON =
  "No accounting period exists for the supplier invoice date. A period covering it must be created before this bill can be recognised.";
export const SUPPLIER_BILL_PERIOD_CLOSED_REASON =
  "The supplier invoice date falls within a closed accounting period and cannot be recognised under the current accounting policy.";
export const SUPPLIER_PAYMENT_AWAITING_RECOGNITION_REASON =
  "This payment settles a supplier bill that has not been recognised yet. Review & Post the supplier bill first.";

export function periodBlockingReason(
  periods: ReadonlyArray<{ companyId: string; startDate: string; endDate: string; status: string }>,
  companyId: string,
  date: string,
  reasons: { missing: string; closed: string }
): string | null {
  const covering = periods.filter((p) => p.companyId === companyId && p.startDate <= date && p.endDate >= date);
  if (covering.length === 0) return reasons.missing;
  return covering.some((p) => p.status === "open") ? null : reasons.closed;
}
