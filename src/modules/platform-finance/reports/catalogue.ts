/**
 * Platform Finance → Reports: the reporting workspace over Finance.
 *
 * Every report declares its FAMILY (what kind of truth it is), its DATE BASIS (how its dates are read), its
 * authoritative SOURCE, and the EXISTING Finance capabilities that already govern that source. Reports introduce no
 * capability of their own: a report is only ever a read of a domain the viewer can already read, always company-scoped
 * through finance_company_access.
 *
 *   statement    formal financial statements — posted journals only (finance_general_ledger_v, status = 'posted').
 *   accounting   accounting registers over posted journals, plus accounting completeness (what is not yet posted).
 *   operational  management reports over operational Finance domains — explicitly NOT the general ledger.
 *   historical   imported pre-SentraCore™ commercial evidence — context only; never merged into any statement.
 */
import { PLATFORM_FINANCE_CAPABILITIES, type PlatformFinanceCapability } from "@/modules/platform-finance/types";
import { FINANCE_PAYABLE_CAPABILITIES } from "@/modules/platform-finance/domain/payables";
import {
  FINANCE_VENDOR_BILL_CAPABILITIES,
  FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
} from "@/modules/platform-finance/domain/vendorBills";
import { FINANCIAL_REQUEST_CAPABILITIES } from "@/modules/platform-finance/domain/requests";

export type FinanceReportFamily = "statement" | "accounting" | "operational" | "historical";

export type FinanceReportId =
  | "profit-and-loss"
  | "balance-sheet"
  | "trial-balance"
  | "general-ledger"
  | "journal"
  | "accounting-completeness"
  | "receivables-ageing"
  | "payables-outstanding"
  | "collections"
  | "supplier-payments"
  | "vendor-bill-pipeline"
  | "financial-request-pipeline";

/** Which parameters the report shell offers. */
export type FinanceReportParameterKind =
  | "period-scope-comparison" // P&L: one period, Period | YTD, optional comparative
  | "period-comparison" // Balance Sheet: as at one period end, optional comparative
  | "period" // Trial Balance: one period
  | "period-range" // GL / Journal: from period → to period
  | "as-at-today" // live operational position; no historical as-at
  | "date-range"; // operational activity between two dates

export type FinanceReportDefinition = {
  id: FinanceReportId;
  family: FinanceReportFamily;
  title: string;
  summary: string;
  /** How the report's dates are read — shown on the landing and on the report itself. */
  basis: string;
  /** The authoritative source, in plain words. */
  source: string;
  parameters: FinanceReportParameterKind;
  /** Any ONE of these existing grants opens the report (plus company access). */
  capabilities: readonly PlatformFinanceCapability[];
};

export type FinanceUnavailableReport = {
  id: "cash-flow";
  family: "statement";
  title: string;
  summary: string;
  reason: string;
};

export type FinanceHistoricalEntry = {
  id: "historical-commercial-facts";
  family: "historical";
  title: string;
  summary: string;
  basis: string;
  href: string;
  capabilities: readonly PlatformFinanceCapability[];
};

const ACCOUNTING_VIEW = [PLATFORM_FINANCE_CAPABILITIES.view] as const;

export const FINANCE_REPORTS: readonly FinanceReportDefinition[] = [
  {
    id: "profit-and-loss",
    family: "statement",
    title: "Profit & Loss",
    summary: "Revenue, direct costs, other income and operating expenses, with an optional comparative column.",
    basis: "For an accounting period, or year to date",
    source: "Posted journals",
    parameters: "period-scope-comparison",
    capabilities: ACCOUNTING_VIEW,
  },
  {
    id: "balance-sheet",
    family: "statement",
    title: "Balance Sheet",
    summary: "Assets, liabilities and equity including derived unclosed earnings, with an optional comparative column.",
    basis: "As at an accounting period end",
    source: "Posted journals",
    parameters: "period-comparison",
    capabilities: ACCOUNTING_VIEW,
  },
  {
    id: "trial-balance",
    family: "statement",
    title: "Trial Balance with movements",
    summary: "Opening balance, period movement and closing balance for every account with posted activity.",
    basis: "Movement for an accounting period; balances as at its end",
    source: "Posted journals",
    parameters: "period",
    capabilities: ACCOUNTING_VIEW,
  },
  {
    id: "general-ledger",
    family: "accounting",
    title: "General Ledger",
    summary: "Every posted line by account, with opening balance, running balance and closing balance.",
    basis: "Accounting periods from → to",
    source: "Posted journals",
    parameters: "period-range",
    capabilities: ACCOUNTING_VIEW,
  },
  {
    id: "journal",
    family: "accounting",
    title: "Journal report",
    summary: "Posted journal entries with their lines and the source record each one came from.",
    basis: "Accounting periods from → to",
    source: "Posted journals",
    parameters: "period-range",
    capabilities: ACCOUNTING_VIEW,
  },
  {
    id: "accounting-completeness",
    family: "accounting",
    title: "Unposted accounting",
    summary: "Supplier bills and payments whose accounting is not yet posted — activity the statements do not yet include.",
    basis: "Current position",
    source: "Review & Post work list",
    parameters: "as-at-today",
    capabilities: [
      PLATFORM_FINANCE_CAPABILITIES.view,
      PLATFORM_FINANCE_CAPABILITIES.create_transaction,
      PLATFORM_FINANCE_CAPABILITIES.post,
    ],
  },
  {
    id: "receivables-ageing",
    family: "operational",
    title: "Receivables ageing",
    summary: "Outstanding customer balances aged by due date, separating ledger-recognised invoices from off-ledger billing.",
    basis: "Current position, aged as at today",
    source: "Receivables",
    parameters: "as-at-today",
    capabilities: [PLATFORM_FINANCE_CAPABILITIES.receivable_view],
  },
  {
    id: "payables-outstanding",
    family: "operational",
    title: "Payables outstanding",
    summary: "Approved supplier and request obligations not yet fully paid, aged by due date.",
    basis: "Current position, aged as at today",
    source: "Payables",
    parameters: "as-at-today",
    capabilities: [
      PLATFORM_FINANCE_CAPABILITIES.view,
      FINANCE_PAYABLE_CAPABILITIES.view,
      FINANCE_PAYABLE_CAPABILITIES.review,
      FINANCE_PAYABLE_CAPABILITIES.approve,
    ],
  },
  {
    id: "collections",
    family: "operational",
    title: "Collections",
    summary: "Confirmed customer receipts by date, with their posting status.",
    basis: "Receipt date between two dates",
    source: "Receipts",
    parameters: "date-range",
    capabilities: [PLATFORM_FINANCE_CAPABILITIES.receipt_view],
  },
  {
    id: "supplier-payments",
    family: "operational",
    title: "Supplier payments",
    summary: "Confirmed payments made against payables, with their accounting status.",
    basis: "Payment date between two dates",
    source: "Payments",
    parameters: "date-range",
    capabilities: [
      PLATFORM_FINANCE_CAPABILITIES.view,
      PLATFORM_FINANCE_CAPABILITIES.create_transaction,
      PLATFORM_FINANCE_CAPABILITIES.post,
    ],
  },
  {
    id: "vendor-bill-pipeline",
    family: "operational",
    title: "Vendor bill pipeline",
    summary: "Submitted supplier bills by workflow status, billed against approved amounts.",
    basis: "Submitted between two dates",
    source: "Vendor Bills",
    parameters: "date-range",
    capabilities: [
      PLATFORM_FINANCE_CAPABILITIES.view,
      FINANCE_VENDOR_BILL_CAPABILITIES.view,
      FINANCE_VENDOR_BILL_CAPABILITIES.review,
      FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
    ],
  },
  {
    id: "financial-request-pipeline",
    family: "operational",
    title: "Financial request pipeline",
    summary: "Submitted financial requests by workflow status, requested against approved and paid amounts.",
    basis: "Submitted between two dates",
    source: "Financial Requests",
    parameters: "date-range",
    capabilities: [
      PLATFORM_FINANCE_CAPABILITIES.view,
      FINANCIAL_REQUEST_CAPABILITIES.review,
      FINANCIAL_REQUEST_CAPABILITIES.approve,
    ],
  },
] as const;

export const FINANCE_UNAVAILABLE_REPORTS: readonly FinanceUnavailableReport[] = [
  {
    id: "cash-flow",
    family: "statement",
    title: "Cash Flow",
    summary: "Statement of cash flows.",
    reason:
      "Not available. The chart of accounts does not classify activity as operating, investing or financing, so a cash flow statement cannot be derived from posted journals without inventing that policy.",
  },
];

export const FINANCE_HISTORICAL_ENTRY: FinanceHistoricalEntry = {
  id: "historical-commercial-facts",
  family: "historical",
  title: "Historical Commercial Facts",
  summary:
    "Imported pre-SentraCore™ commercial evidence. Context only — it is not accounting and is never included in any statement or report here.",
  basis: "As imported",
  href: "/platform-finance/historical-facts",
  capabilities: [
    PLATFORM_FINANCE_CAPABILITIES.historical_view,
    PLATFORM_FINANCE_CAPABILITIES.historical_manage,
  ],
};

export const FINANCE_REPORT_FAMILY_LABELS: Record<FinanceReportFamily, string> = {
  statement: "Financial statement",
  accounting: "Accounting report",
  operational: "Management report",
  historical: "Historical context",
};

export function financeReportById(id: string): FinanceReportDefinition | null {
  return FINANCE_REPORTS.find((report) => report.id === id) ?? null;
}

export function canOpenFinanceReport(
  report: Pick<FinanceReportDefinition, "capabilities">,
  granted: ReadonlySet<string>
): boolean {
  return report.capabilities.some((capability) => granted.has(capability));
}

export function financeReportHref(id: FinanceReportId): string {
  return `/platform-finance/reports/${id}`;
}
