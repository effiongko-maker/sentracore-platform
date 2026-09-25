/**
 * Reports — management / operational reports over operational Finance domains.
 *
 * These are NOT accounting figures. Each builder reads only its own domain's authoritative records (already
 * permission-filtered by that domain's service) and never the general ledger or Historical Commercial Facts.
 * Amounts are totalled per currency — never summed across currencies. A missing due date is its own bucket; it is
 * never inferred.
 */
import { roundMoney2 } from "@/modules/platform-finance/domain/accountingReadModels";
import type { FinanceReceivable } from "@/modules/platform-finance/domain/receivables";
import { receivableReference } from "@/modules/platform-finance/domain/receivables";
import type { FinancePayableStatus, FinancePayableView } from "@/modules/platform-finance/domain/payables";
import type { FinanceReceipt } from "@/modules/platform-finance/domain/receipts";
import type { PaymentAccountingWorkItem } from "@/modules/platform-finance/domain/paymentAccounting";
import type { FinanceVendorBill } from "@/modules/platform-finance/domain/vendorBills";
import type { FinancialRequest } from "@/modules/platform-finance/domain/requests";
import type { AccountingReviewWorkItem } from "@/modules/platform-finance/domain/accountingReview";

// ── Shared ───────────────────────────────────────────────────────────────────────────────────────────────────

export type CurrencyTotal = { currency: string; amount: number };

export function totalsByCurrency<T>(rows: readonly T[], currency: (row: T) => string, amount: (row: T) => number): CurrencyTotal[] {
  const map = new Map<string, number>();
  for (const row of rows) map.set(currency(row), roundMoney2((map.get(currency(row)) ?? 0) + amount(row)));
  return [...map.entries()].map(([c, a]) => ({ currency: c, amount: a })).sort((a, b) => a.currency.localeCompare(b.currency));
}

export function isIsoDate(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`));
}

export function inDateRange(date: string | null | undefined, from: string, to: string): boolean {
  if (!date) return false;
  const day = date.slice(0, 10);
  return day >= from && day <= to;
}

// ── Ageing ───────────────────────────────────────────────────────────────────────────────────────────────────

export const AGEING_BUCKETS = ["not_due", "d1_30", "d31_60", "d61_90", "d90_plus", "no_due_date"] as const;
export type AgeingBucket = (typeof AGEING_BUCKETS)[number];
export const AGEING_BUCKET_LABELS: Record<AgeingBucket, string> = {
  not_due: "Not yet due",
  d1_30: "1–30 days overdue",
  d31_60: "31–60 days overdue",
  d61_90: "61–90 days overdue",
  d90_plus: "Over 90 days overdue",
  no_due_date: "No due date recorded",
};

export function daysOverdue(dueDate: string, asAt: string): number {
  return Math.round((Date.parse(`${asAt}T00:00:00Z`) - Date.parse(`${dueDate.slice(0, 10)}T00:00:00Z`)) / 86_400_000);
}

export function ageingBucket(dueDate: string | null, asAt: string): AgeingBucket {
  if (!dueDate) return "no_due_date";
  const days = daysOverdue(dueDate, asAt);
  if (days <= 0) return "not_due";
  if (days <= 30) return "d1_30";
  if (days <= 60) return "d31_60";
  if (days <= 90) return "d61_90";
  return "d90_plus";
}

export type AgeingSummaryRow = { bucket: AgeingBucket; label: string; count: number; totals: CurrencyTotal[] };

function ageingSummary<T extends { bucket: AgeingBucket; currency: string; outstanding: number }>(rows: readonly T[]): AgeingSummaryRow[] {
  return AGEING_BUCKETS.map((bucket) => {
    const inBucket = rows.filter((r) => r.bucket === bucket);
    return { bucket, label: AGEING_BUCKET_LABELS[bucket], count: inBucket.length, totals: totalsByCurrency(inBucket, (r) => r.currency, (r) => r.outstanding) };
  });
}

// ── Receivables ageing ───────────────────────────────────────────────────────────────────────────────────────

export type ReceivableAgeingRow = {
  receivableId: string;
  reference: string;
  counterparty: string;
  origin: FinanceReceivable["originType"];
  ledgerRecognised: boolean;
  documentDate: string | null;
  dueDate: string | null;
  daysOverdue: number | null;
  bucket: AgeingBucket;
  currency: string;
  original: number;
  outstanding: number;
  href: string;
};

export type ReceivablesAgeingReport = {
  asAt: string;
  rows: ReceivableAgeingRow[];
  summary: AgeingSummaryRow[];
  ledgerRecognisedTotals: CurrencyTotal[];
  offLedgerTotals: CurrencyTotal[];
  totals: CurrencyTotal[];
  settledExcluded: number;
};

export function buildReceivablesAgeing(input: { receivables: readonly FinanceReceivable[]; companyId: string; asAt: string }): ReceivablesAgeingReport {
  const company = input.receivables.filter((r) => r.companyId === input.companyId);
  const open = company.filter((r) => r.outstandingAmount > 0);
  const rows: ReceivableAgeingRow[] = open
    .map((r) => ({
      receivableId: r.id,
      reference: receivableReference(r),
      counterparty: r.counterpartyDisplayName,
      origin: r.originType,
      ledgerRecognised: !r.offLedger,
      documentDate: r.invoiceDate ?? r.submittedOn,
      dueDate: r.dueDate,
      daysOverdue: r.dueDate ? Math.max(0, daysOverdue(r.dueDate, input.asAt)) : null,
      bucket: ageingBucket(r.dueDate, input.asAt),
      currency: r.currency,
      original: r.originalAmount,
      outstanding: r.outstandingAmount,
      href: r.invoiceId ? `/platform-finance/invoices/${encodeURIComponent(r.invoiceId)}` : "/platform-finance/receivables",
    }))
    .sort((a, b) => (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1) || a.counterparty.localeCompare(b.counterparty));
  return {
    asAt: input.asAt,
    rows,
    summary: ageingSummary(rows),
    ledgerRecognisedTotals: totalsByCurrency(rows.filter((r) => r.ledgerRecognised), (r) => r.currency, (r) => r.outstanding),
    offLedgerTotals: totalsByCurrency(rows.filter((r) => !r.ledgerRecognised), (r) => r.currency, (r) => r.outstanding),
    totals: totalsByCurrency(rows, (r) => r.currency, (r) => r.outstanding),
    settledExcluded: company.length - open.length,
  };
}

// ── Payables outstanding ─────────────────────────────────────────────────────────────────────────────────────

/** Approved obligations that still owe money. Drafts / pending approval are not yet obligations. */
export const OUTSTANDING_PAYABLE_STATUSES: readonly FinancePayableStatus[] = [
  "approved",
  "partially_paid",
  "scheduled",
  "payment_pending",
  "disputed",
];

export type PayableOutstandingRow = {
  payableId: string;
  payee: string;
  source: "Vendor Bill" | "Financial Request";
  status: FinancePayableStatus;
  dueDate: string | null;
  daysOverdue: number | null;
  bucket: AgeingBucket;
  currency: string;
  payable: number;
  paid: number;
  outstanding: number;
  href: string;
};

export type PayablesOutstandingReport = {
  asAt: string;
  rows: PayableOutstandingRow[];
  summary: AgeingSummaryRow[];
  totals: CurrencyTotal[];
  bySource: Array<{ source: PayableOutstandingRow["source"]; count: number; totals: CurrencyTotal[] }>;
  awaitingApproval: { count: number; totals: CurrencyTotal[] };
};

export function buildPayablesOutstanding(input: { payables: readonly FinancePayableView[]; companyId: string; asAt: string }): PayablesOutstandingReport {
  const company = input.payables.filter((p) => p.companyId === input.companyId);
  const rows: PayableOutstandingRow[] = company
    .filter((p) => OUTSTANDING_PAYABLE_STATUSES.includes(p.status) && p.outstandingAmount > 0)
    .map((p) => ({
      payableId: p.id,
      payee: p.payeeName,
      source: p.sourceType === "vendor_bill" ? ("Vendor Bill" as const) : ("Financial Request" as const),
      status: p.status,
      dueDate: p.dueDate,
      daysOverdue: p.dueDate ? Math.max(0, daysOverdue(p.dueDate, input.asAt)) : null,
      bucket: ageingBucket(p.dueDate, input.asAt),
      currency: p.currency,
      payable: p.payableAmount,
      paid: p.paidAmount,
      outstanding: p.outstandingAmount,
      href: `/platform-finance/payables/${encodeURIComponent(p.id)}`,
    }))
    .sort((a, b) => (b.daysOverdue ?? -1) - (a.daysOverdue ?? -1) || a.payee.localeCompare(b.payee));
  const pending = company.filter((p) => p.status === "pending_approval");
  return {
    asAt: input.asAt,
    rows,
    summary: ageingSummary(rows),
    totals: totalsByCurrency(rows, (r) => r.currency, (r) => r.outstanding),
    bySource: (["Vendor Bill", "Financial Request"] as const).map((source) => {
      const subset = rows.filter((r) => r.source === source);
      return { source, count: subset.length, totals: totalsByCurrency(subset, (r) => r.currency, (r) => r.outstanding) };
    }),
    awaitingApproval: { count: pending.length, totals: totalsByCurrency(pending, (p) => p.currency, (p) => p.payableAmount) },
  };
}

// ── Collections ──────────────────────────────────────────────────────────────────────────────────────────────

export type CollectionRow = {
  receiptId: string;
  reference: string;
  receiptDate: string;
  counterparty: string;
  destination: string;
  allocatedTo: string;
  currency: string;
  amount: number;
  status: "confirmed" | "posted";
  journalEntryId: string | null;
};

export type CollectionsReport = {
  from: string;
  to: string;
  rows: CollectionRow[];
  totals: CurrencyTotal[];
  postedTotals: CurrencyTotal[];
  awaitingPostingTotals: CurrencyTotal[];
  draftsExcluded: number;
};

export function buildCollectionsReport(input: { receipts: readonly FinanceReceipt[]; companyId: string; from: string; to: string }): CollectionsReport {
  const inScope = input.receipts.filter((r) => r.companyId === input.companyId && inDateRange(r.receiptDate, input.from, input.to));
  const rows: CollectionRow[] = inScope
    .filter((r): r is FinanceReceipt & { status: "confirmed" | "posted" } => r.status === "confirmed" || r.status === "posted")
    .map((r) => ({
      receiptId: r.id,
      reference: r.reference,
      receiptDate: r.receiptDate,
      counterparty: r.counterpartyDisplayName ?? "—",
      destination: r.destinationAccountName ? `${r.destinationAccountName}${r.destinationAccountLast4 ? ` · •••• ${r.destinationAccountLast4}` : ""}` : "—",
      allocatedTo: r.allocations.map((a) => a.invoiceReference).join(", ") || "—",
      currency: r.currency,
      amount: r.amount,
      status: r.status,
      journalEntryId: r.journalEntryId,
    }))
    .sort((a, b) => a.receiptDate.localeCompare(b.receiptDate) || a.reference.localeCompare(b.reference));
  return {
    from: input.from,
    to: input.to,
    rows,
    totals: totalsByCurrency(rows, (r) => r.currency, (r) => r.amount),
    postedTotals: totalsByCurrency(rows.filter((r) => r.status === "posted"), (r) => r.currency, (r) => r.amount),
    awaitingPostingTotals: totalsByCurrency(rows.filter((r) => r.status === "confirmed"), (r) => r.currency, (r) => r.amount),
    draftsExcluded: inScope.length - rows.length,
  };
}

// ── Supplier payments ────────────────────────────────────────────────────────────────────────────────────────

export type SupplierPaymentRow = {
  paymentId: string;
  reference: string;
  paymentDate: string;
  payee: string;
  treatment: string;
  currency: string;
  amount: number;
  accountingStatus: "posted" | "awaiting";
  blockingReason: string | null;
  journalEntryId: string | null;
  href: string;
};

export type SupplierPaymentsReport = {
  from: string;
  to: string;
  rows: SupplierPaymentRow[];
  totals: CurrencyTotal[];
  postedTotals: CurrencyTotal[];
  awaitingTotals: CurrencyTotal[];
};

export function buildSupplierPaymentsReport(input: { payments: readonly PaymentAccountingWorkItem[]; companyId: string; from: string; to: string }): SupplierPaymentsReport {
  const rows: SupplierPaymentRow[] = input.payments
    .filter((p) => p.companyId === input.companyId && inDateRange(p.paymentDate, input.from, input.to))
    .map((p) => ({
      paymentId: p.paymentId,
      reference: `PAY-${p.paymentId.slice(0, 8).toUpperCase()}`,
      paymentDate: p.paymentDate,
      payee: p.payeeName,
      treatment: p.treatment === "accrued_settlement" ? "Settles recognised supplier bill" : "Financial Request payment",
      currency: p.currency,
      amount: p.amount,
      accountingStatus: p.accountingStatus === "posted" ? ("posted" as const) : ("awaiting" as const),
      blockingReason: p.accountingStatus === "posted" ? null : p.blockingReason,
      journalEntryId: p.journalEntryId,
      href: `/platform-finance/payables/${encodeURIComponent(p.payableId)}`,
    }))
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate) || a.reference.localeCompare(b.reference));
  return {
    from: input.from,
    to: input.to,
    rows,
    totals: totalsByCurrency(rows, (r) => r.currency, (r) => r.amount),
    postedTotals: totalsByCurrency(rows.filter((r) => r.accountingStatus === "posted"), (r) => r.currency, (r) => r.amount),
    awaitingTotals: totalsByCurrency(rows.filter((r) => r.accountingStatus === "awaiting"), (r) => r.currency, (r) => r.amount),
  };
}

// ── Workflow pipelines ───────────────────────────────────────────────────────────────────────────────────────

export type PipelineStatusRow = { status: string; label: string; count: number; amounts: Array<{ label: string; totals: CurrencyTotal[] }> };

export type PipelineRow = {
  id: string;
  submittedOn: string;
  party: string;
  reference: string;
  status: string;
  statusLabel: string;
  currency: string;
  amounts: number[];
  href: string;
};

export type PipelineReport = {
  from: string;
  to: string;
  amountLabels: string[];
  statuses: PipelineStatusRow[];
  rows: PipelineRow[];
  draftsExcluded: number;
};

export function statusLabel(status: string): string {
  const text = status.replace(/_/g, " ");
  return text === "pending ceo approval" ? "Pending CEO approval" : text.charAt(0).toUpperCase() + text.slice(1);
}

function pipeline<T>(input: {
  records: readonly T[];
  companyId: string;
  from: string;
  to: string;
  order: readonly string[];
  companyOf: (r: T) => string;
  submittedOf: (r: T) => string | null;
  statusOf: (r: T) => string;
  currencyOf: (r: T) => string;
  amountLabels: string[];
  amountsOf: (r: T) => number[];
  row: (r: T) => Pick<PipelineRow, "id" | "party" | "reference" | "href">;
}): PipelineReport {
  const company = input.records.filter((r) => input.companyOf(r) === input.companyId);
  const submitted = company.filter((r) => input.submittedOf(r) && inDateRange(input.submittedOf(r), input.from, input.to));
  const draftsInCompany = company.filter((r) => !input.submittedOf(r)).length;
  const statuses = input.order
    .map((status) => {
      const subset = submitted.filter((r) => input.statusOf(r) === status);
      return {
        status,
        label: statusLabel(status),
        count: subset.length,
        amounts: input.amountLabels.map((label, i) => ({
          label,
          totals: totalsByCurrency(subset, input.currencyOf, (r) => input.amountsOf(r)[i] ?? 0),
        })),
      };
    })
    .filter((s) => s.count > 0);
  return {
    from: input.from,
    to: input.to,
    amountLabels: input.amountLabels,
    statuses,
    rows: submitted
      .map((r) => ({
        ...input.row(r),
        submittedOn: (input.submittedOf(r) ?? "").slice(0, 10),
        status: input.statusOf(r),
        statusLabel: statusLabel(input.statusOf(r)),
        currency: input.currencyOf(r),
        amounts: input.amountsOf(r),
      }))
      .sort((a, b) => a.submittedOn.localeCompare(b.submittedOn)),
    draftsExcluded: draftsInCompany,
  };
}

const WORKFLOW_ORDER = ["submitted", "under_review", "query", "resubmitted", "pending_ceo_approval", "approved", "partially_approved", "rejected"] as const;

export function buildVendorBillPipeline(input: { bills: readonly FinanceVendorBill[]; companyId: string; from: string; to: string }): PipelineReport {
  const decided = (b: FinanceVendorBill) => b.status === "approved" || b.status === "partially_approved";
  return pipeline({
    records: input.bills,
    companyId: input.companyId,
    from: input.from,
    to: input.to,
    order: WORKFLOW_ORDER,
    companyOf: (b) => b.companyId,
    submittedOf: (b) => b.submittedAt,
    statusOf: (b) => b.status,
    currencyOf: (b) => b.currency,
    amountLabels: ["Billed", "Approved"],
    // Approved amount is only meaningful once a decision exists.
    amountsOf: (b) => [b.billedAmount, decided(b) ? b.approvedAmount : 0],
    row: (b) => ({ id: b.id, party: b.payeeName, reference: b.invoiceReference ?? "—", href: `/platform-finance/vendor-bills/${encodeURIComponent(b.id)}` }),
  });
}

export function buildFinancialRequestPipeline(input: { requests: readonly FinancialRequest[]; companyId: string; from: string; to: string }): PipelineReport {
  const decided = (r: FinancialRequest) => r.status === "approved" || r.status === "partially_approved";
  return pipeline({
    records: input.requests,
    companyId: input.companyId,
    from: input.from,
    to: input.to,
    order: WORKFLOW_ORDER,
    companyOf: (r) => r.companyId,
    submittedOf: (r) => r.submittedAt,
    statusOf: (r) => r.status,
    currencyOf: (r) => r.currency,
    amountLabels: ["Requested", "Approved", "Paid"],
    amountsOf: (r) => [r.requestedAmount, decided(r) ? r.approvedAmount : 0, r.paidAmount],
    row: (r) => ({ id: r.id, party: r.payeeName, reference: r.externalReference ?? "—", href: `/platform-finance/requests/${encodeURIComponent(r.id)}` }),
  });
}

// ── Accounting completeness ──────────────────────────────────────────────────────────────────────────────────

export type CompletenessRow = {
  sourceType: AccountingReviewWorkItem["sourceType"];
  sourceLabel: string;
  sourceHref: string;
  counterparty: string;
  reference: string | null;
  accountingDate: string;
  currency: string;
  amount: number;
  state: "blocked" | "draft" | "not_started";
  blockingReason: string | null;
};

export type AccountingCompletenessReport = {
  rows: CompletenessRow[];
  groups: Array<{ label: string; count: number; totals: CurrencyTotal[] }>;
  blockedCount: number;
};

export function buildAccountingCompleteness(input: { work: readonly AccountingReviewWorkItem[]; companyId: string }): AccountingCompletenessReport {
  const rows: CompletenessRow[] = input.work
    .filter((w) => w.companyId === input.companyId && w.status !== "posted")
    .map((w) => ({
      sourceType: w.sourceType,
      sourceLabel: w.sourceLabel,
      sourceHref: w.sourceHref,
      counterparty: w.counterparty,
      reference: w.reference,
      accountingDate: w.accountingDate,
      currency: w.currency,
      amount: w.amount,
      state: w.blockingReason ? ("blocked" as const) : w.status === "draft" ? ("draft" as const) : ("not_started" as const),
      blockingReason: w.blockingReason,
    }))
    .sort((a, b) => a.accountingDate.localeCompare(b.accountingDate));
  const groups = (["vendor_bill", "payment"] as const).map((type) => {
    const subset = rows.filter((r) => r.sourceType === type);
    return {
      label: type === "vendor_bill" ? "Supplier bills awaiting recognition" : "Payments awaiting accounting",
      count: subset.length,
      totals: totalsByCurrency(subset, (r) => r.currency, (r) => r.amount),
    };
  });
  return { rows, groups, blockedCount: rows.filter((r) => r.state === "blocked").length };
}
