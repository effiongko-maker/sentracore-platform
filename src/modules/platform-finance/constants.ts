import {
  PLATFORM_FINANCE_CAPABILITIES,
  type FinanceAccountStatus,
  type FinanceAccountType,
  type FinanceEntityStatus,
  type FinanceJournalEntryStatus,
  type FinancePeriodStatus,
  type FinanceTransactionStatus,
  type FinanceTransactionType,
  type PlatformFinanceCapability,
} from "./types";

export const PLATFORM_FINANCE_CAPABILITY_LABELS: Record<
  PlatformFinanceCapability,
  string
> = {
  [PLATFORM_FINANCE_CAPABILITIES.view]: "View",
  [PLATFORM_FINANCE_CAPABILITIES.manage_setup]: "Manage setup",
  [PLATFORM_FINANCE_CAPABILITIES.manage_periods]: "Manage periods",
  [PLATFORM_FINANCE_CAPABILITIES.manage_coa]: "Manage chart of accounts",
  [PLATFORM_FINANCE_CAPABILITIES.create_transaction]: "Create transactions",
  [PLATFORM_FINANCE_CAPABILITIES.post]: "Post to journal",
  [PLATFORM_FINANCE_CAPABILITIES.financial_account_view]:
    "View financial accounts",
  [PLATFORM_FINANCE_CAPABILITIES.financial_account_manage]:
    "Manage financial accounts",
  [PLATFORM_FINANCE_CAPABILITIES.request_create]: "Create financial requests",
  [PLATFORM_FINANCE_CAPABILITIES.request_view_own]: "View own financial requests",
  [PLATFORM_FINANCE_CAPABILITIES.request_review]: "Review financial requests",
  [PLATFORM_FINANCE_CAPABILITIES.request_approve]: "Approve financial requests",
  [PLATFORM_FINANCE_CAPABILITIES.payable_view]: "View payables",
  [PLATFORM_FINANCE_CAPABILITIES.payable_create]: "Create payables",
  [PLATFORM_FINANCE_CAPABILITIES.payable_review]: "Review payables",
  [PLATFORM_FINANCE_CAPABILITIES.payable_approve]: "Approve payables",
  [PLATFORM_FINANCE_CAPABILITIES.vendor_bill_view]: "View vendor bills",
  [PLATFORM_FINANCE_CAPABILITIES.vendor_bill_create]: "Input vendor bills",
  [PLATFORM_FINANCE_CAPABILITIES.vendor_bill_review]: "Review vendor bills",
  [PLATFORM_FINANCE_CAPABILITIES.payment_view]: "View payments",
  [PLATFORM_FINANCE_CAPABILITIES.payment_execute]: "Confirm payments",
  [PLATFORM_FINANCE_CAPABILITIES.counterparty_view]: "View counterparties",
  [PLATFORM_FINANCE_CAPABILITIES.counterparty_manage]: "Manage counterparties",
  [PLATFORM_FINANCE_CAPABILITIES.invoice_view]: "View invoices",
  [PLATFORM_FINANCE_CAPABILITIES.invoice_create]: "Create invoices",
  [PLATFORM_FINANCE_CAPABILITIES.invoice_review]: "Review invoices",
  [PLATFORM_FINANCE_CAPABILITIES.invoice_issue]: "Issue invoices",
  [PLATFORM_FINANCE_CAPABILITIES.receivable_view]: "View receivables",
};

export const PLATFORM_FINANCE_ENTITY_STATUS_LABELS: Record<
  FinanceEntityStatus,
  string
> = {
  active: "Active",
  inactive: "Inactive",
};

export const PLATFORM_FINANCE_ACCOUNT_TYPE_LABELS: Record<
  FinanceAccountType,
  string
> = {
  asset: "Asset",
  liability: "Liability",
  equity: "Equity",
  revenue: "Revenue",
  expense: "Expense",
};

export const PLATFORM_FINANCE_ACCOUNT_STATUS_LABELS: Record<
  FinanceAccountStatus,
  string
> = {
  active: "Active",
  inactive: "Inactive",
};

export const PLATFORM_FINANCE_PERIOD_STATUS_LABELS: Record<
  FinancePeriodStatus,
  string
> = {
  open: "Open",
  closed: "Closed",
};

export const PLATFORM_FINANCE_TRANSACTION_STATUS_LABELS: Record<
  FinanceTransactionStatus,
  string
> = {
  draft: "Draft",
  posted: "Posted",
  voided: "Voided",
};

export const PLATFORM_FINANCE_TRANSACTION_TYPE_LABELS: Record<
  FinanceTransactionType,
  string
> = {
  foundation: "Foundation",
  adjustment: "Adjustment",
  reversal: "Reversal",
  expense: "Expense",
  payment: "Payment",
  receipt: "Receipt",
  transfer: "Transfer",
  other: "Other",
};

export const PLATFORM_FINANCE_JOURNAL_STATUS_LABELS: Record<
  FinanceJournalEntryStatus,
  string
> = {
  draft: "Draft",
  posted: "Posted",
};

export const PLATFORM_FINANCE_CAPABILITY_LIST = Object.values(
  PLATFORM_FINANCE_CAPABILITIES
) as readonly PlatformFinanceCapability[];

/** Max records shown on Finance Overview list cards (Recent Activity, etc.). */
export const PLATFORM_FINANCE_OVERVIEW_LIST_LIMIT = 5;

/** Journal Register default line rows per page. */
export const PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZE_DEFAULT = 20;

/** Journal Register selectable line page sizes. */
export const PLATFORM_FINANCE_JOURNAL_REGISTER_PAGE_SIZES = [20, 50] as const;
