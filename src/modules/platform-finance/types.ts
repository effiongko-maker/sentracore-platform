/**
 * Platform Finance (organisation-wide multi-company accounting).
 * Distinct from Facility Management Finance (`src/modules/finance`) and ECC finance.
 */

import type { PlatformModuleSlug } from "@/lib/actions/types";

export const PLATFORM_FINANCE_MODULE_SLUG =
  "platform_finance" satisfies PlatformModuleSlug;

export const PLATFORM_FINANCE_WORKSPACE_ID = "finance" as const;

export {
  PAYMENT_DESTINATION_METHODS,
  validatePaymentDestinationInput,
  paymentDestinationLast4,
  type PaymentDestination,
  type PaymentDestinationInput,
  type PaymentDestinationMethod,
  type PaymentDestinationMutation,
} from "./domain/paymentDestination";

export type PlatformFinanceModuleSlug = typeof PLATFORM_FINANCE_MODULE_SLUG;
export type PlatformFinanceWorkspaceId = typeof PLATFORM_FINANCE_WORKSPACE_ID;

/** Capability strings stored in finance_capability_grants.capability */
export const PLATFORM_FINANCE_CAPABILITIES = {
  view: "platform_finance.view",
  manage_setup: "platform_finance.manage_setup",
  manage_periods: "platform_finance.manage_periods",
  manage_coa: "platform_finance.manage_coa",
  create_transaction: "platform_finance.create_transaction",
  post: "platform_finance.post",
  financial_account_view: "platform_finance.financial_account.view",
  financial_account_manage: "platform_finance.financial_account.manage",
  request_create: "platform_finance.request.create",
  request_view_own: "platform_finance.request.view_own",
  request_review: "platform_finance.request.review",
  request_approve: "platform_finance.request.approve",
  payable_view: "platform_finance.payable.view",
  payable_create: "platform_finance.payable.create",
  payable_review: "platform_finance.payable.review",
  payable_approve: "platform_finance.payable.approve",
  // Vendor Bill has no dedicated approve capability: CEO authority over every
  // obligation is request_approve above.
  vendor_bill_view: "platform_finance.vendor_bill.view",
  vendor_bill_create: "platform_finance.vendor_bill.create",
  vendor_bill_review: "platform_finance.vendor_bill.review",
  payment_view: "platform_finance.payment.view",
  payment_execute: "platform_finance.payment.execute",
  counterparty_view: "platform_finance.counterparty.view",
  counterparty_manage: "platform_finance.counterparty.manage",
  invoice_view: "platform_finance.invoice.view",
  invoice_create: "platform_finance.invoice.create",
  invoice_review: "platform_finance.invoice.review",
  invoice_issue: "platform_finance.invoice.issue",
  receivable_view: "platform_finance.receivable.view",
  receipt_view: "platform_finance.receipt.view",
  receipt_record: "platform_finance.receipt.record",
  receipt_post: "platform_finance.receipt.post",
} as const;

export {
  FINANCIAL_REQUEST_STATUSES,
  FINANCIAL_REQUEST_TRANSITIONS,
  FINANCIAL_REQUEST_TERMINAL_STATUSES,
  FINANCIAL_REQUEST_PAYEE_TYPES,
  FINANCIAL_REQUEST_DOCUMENT_ROLES,
  FINANCIAL_REQUEST_EVENT_TYPES,
  FINANCIAL_REQUEST_CAPABILITIES,
  FINANCIAL_REQUEST_SEPARATION_OF_DUTIES,
  FINANCIAL_REQUEST_CATEGORY_SEEDS,
  financialRequestOutstandingAmount,
  isAllowedFinancialRequestTransition,
  isFinancialRequestStatus,
  assertFinancialRequestTransition,
  isFinancialRequestTerminalStatus,
  type FinancialRequest,
  type FinancialRequestStatus,
  type FinancialRequestTerminalStatus,
  type FinancialRequestCategory,
  type FinancialRequestDocument,
  type FinancialRequestDocumentRole,
  type FinancialRequestEvent,
  type FinancialRequestEventType,
  type FinancialRequestPayeeType,
  type FinancialRequestCapability,
} from "./domain/requests";

export {
  FINANCE_PAYABLE_STATUSES,
  FINANCE_PAYABLE_PRIMARY_STATUSES,
  FINANCE_PAYABLE_EXCEPTION_STATUSES,
  FINANCE_PAYABLE_TRANSITIONS,
  FINANCE_PAYABLE_BANKING_DEFERRED_TRANSITIONS,
  FINANCE_PAYABLE_PAYMENT_ELIGIBLE_STATUSES,
  FINANCE_PAYABLE_SOURCE_TYPES,
  FINANCE_PAYABLE_PAYEE_TYPES,
  FINANCE_PAYABLE_EVENT_TYPES,
  FINANCE_PAYABLE_DOCUMENT_ROLES,
  FINANCE_PAYABLE_CAPABILITIES,
  FINANCE_PAYABLE_INVARIANTS,
  financePayableOutstandingAmount,
  toFinancePayableView,
  isFinancePayableStatus,
  isFinancePayablePaymentEligible,
  isAllowedFinancePayableTransition,
  assertFinancePayableTransition,
  isFinancePayableSourceType,
  type FinancePayable,
  type FinancePayableView,
  type FinancePayableSourceRequestSummary,
  type FinancePayableStatus,
  type FinancePayableSourceType,
  type FinancePayablePayeeType,
  type FinancePayableEvent,
  type FinancePayableEventType,
  type FinancePayableDocument,
  type FinancePayableDocumentRole,
  type FinancePayableCapability,
} from "./domain/payables";

export {
  FINANCE_PAYMENT_STATUSES,
  FINANCE_PAYMENT_CAPABILITIES,
  FINANCE_PAYMENT_INVARIANTS,
  isFinancePaymentStatus,
  type FinancePayment,
  type FinancePaymentView,
  type FinancePaymentStatus,
  type FinancePaymentCapability,
  type ConfirmFinancePaymentInput,
} from "./domain/payments";

export {
  FINANCE_VENDOR_BILL_STATUSES,
  FINANCE_VENDOR_BILL_TERMINAL_STATUSES,
  FINANCE_VENDOR_BILL_TRANSITIONS,
  FINANCE_VENDOR_BILL_INPUTTER_EDITABLE_STATUSES,
  FINANCE_VENDOR_BILL_PAYEE_TYPES,
  FINANCE_VENDOR_BILL_DOCUMENT_ROLES,
  FINANCE_VENDOR_BILL_EVENT_TYPES,
  FINANCE_VENDOR_BILL_CAPABILITIES,
  FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
  FINANCE_VENDOR_BILL_SEPARATION_OF_DUTIES,
  FINANCE_VENDOR_BILL_INVARIANTS,
  financeVendorBillDisallowedAmount,
  isFinanceVendorBillStatus,
  isAllowedFinanceVendorBillTransition,
  assertFinanceVendorBillTransition,
  isFinanceVendorBillTerminalStatus,
  type FinanceVendorBill,
  type FinanceVendorBillStatus,
  type FinanceVendorBillTerminalStatus,
  type FinanceVendorBillPayeeType,
  type FinanceVendorBillDocument,
  type FinanceVendorBillDocumentRole,
  type FinanceVendorBillEvent,
  type FinanceVendorBillEventType,
  type FinanceVendorBillPayableSummary,
  type FinanceVendorBillCapability,
} from "./domain/vendorBills";

export type PlatformFinanceCapability =
  (typeof PLATFORM_FINANCE_CAPABILITIES)[keyof typeof PLATFORM_FINANCE_CAPABILITIES];

export type FinanceEntityStatus = "active" | "inactive";

export type FinanceAccountType =
  | "asset"
  | "liability"
  | "equity"
  | "revenue"
  | "expense";

export type FinanceAccountStatus = "active" | "inactive";

export type FinanceFinancialAccountType = "bank" | "cash" | "petty_cash";

export type FinanceFinancialAccountVisibility = "company" | "restricted";

export type FinanceFinancialAccount = {
  id: string;
  organisationId: string;
  companyId: string;
  accountType: FinanceFinancialAccountType;
  name: string;
  institutionName: string | null;
  accountNumberLast4: string | null;
  currency: string;
  controlGlAccountId: string;
  visibilityPolicy: FinanceFinancialAccountVisibility;
  status: FinanceAccountStatus;
  createdByProfileId: string;
  createdAt: string;
  updatedAt: string;
};

export type FinanceFinancialAccountView = FinanceFinancialAccount & {
  companyName: string;
  controlGlAccountCode: string;
  controlGlAccountName: string;
};

export type FinancePeriodStatus = "open" | "closed";

export type FinanceTransactionStatus = "draft" | "posted" | "voided";

export type FinanceTransactionType =
  | "foundation"
  | "adjustment"
  | "reversal"
  | "expense"
  | "payment"
  | "receipt"
  | "transfer"
  | "other";

export type FinanceJournalEntryStatus = "draft" | "posted";

export type FinanceCompany = {
  id: string;
  organisationId: string;
  code: string;
  name: string;
  status: FinanceEntityStatus;
  createdAt: string;
  updatedAt: string;
};

export type FinanceAccount = {
  id: string;
  organisationId: string;
  code: string;
  name: string;
  accountType: FinanceAccountType;
  classification: string | null;
  status: FinanceAccountStatus;
  createdAt: string;
  updatedAt: string;
};

export type FinancePeriod = {
  id: string;
  organisationId: string;
  companyId: string;
  year: number;
  month: number;
  startDate: string;
  endDate: string;
  status: FinancePeriodStatus;
  closedAt: string | null;
  closedByProfileId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceTransaction = {
  id: string;
  organisationId: string;
  companyId: string;
  reference: string;
  transactionDate: string;
  transactionType: FinanceTransactionType;
  description: string;
  amount: number | null;
  currency: string;
  status: FinanceTransactionStatus;
  sourceType: string | null;
  sourceId: string | null;
  metadata: Record<string, unknown>;
  journalEntryId: string | null;
  createdByProfileId: string;
  postedAt: string | null;
  postedByProfileId: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceJournalEntry = {
  id: string;
  organisationId: string;
  companyId: string;
  periodId: string;
  transactionId: string;
  entryDate: string;
  reference: string;
  description: string;
  status: FinanceJournalEntryStatus;
  postedAt: string;
  postedByProfileId: string;
  createdAt: string;
};

export type FinanceJournalLine = {
  id: string;
  journalEntryId: string;
  accountId: string;
  lineNo: number;
  description: string | null;
  debit: number;
  credit: number;
  createdAt: string;
};

export type FinanceAuditEvent = {
  id: string;
  organisationId: string;
  companyId: string | null;
  actorProfileId: string;
  action: string;
  objectType: string;
  objectId: string;
  reason: string | null;
  details: Record<string, unknown>;
  createdAt: string;
};

export type FinancePostingLineInput = {
  accountId: string;
  debit: number;
  credit: number;
  description?: string | null;
};

export type FinanceFoundationStatus = {
  module: PlatformFinanceModuleSlug;
  phase: "foundation";
  ready: true;
  persistence: "supabase";
  companies: number;
  accounts: number;
  openPeriods: number;
  draftTransactions: number;
  postedTransactions: number;
};
