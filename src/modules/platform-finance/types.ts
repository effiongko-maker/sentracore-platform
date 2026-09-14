/**
 * Platform Finance (organisation-wide multi-company accounting).
 * Distinct from Facility Management Finance (`src/modules/finance`) and ECC finance.
 */

import type { PlatformModuleSlug } from "@/lib/actions/types";

export const PLATFORM_FINANCE_MODULE_SLUG =
  "platform_finance" satisfies PlatformModuleSlug;

export const PLATFORM_FINANCE_WORKSPACE_ID = "finance" as const;

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
} as const;

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
