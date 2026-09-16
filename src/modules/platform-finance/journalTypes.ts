/**
 * Journal register / detail presentation types.
 * Sourced from finance_journal_entries + lines + related FT/accounts.
 * Read-only — no mutation surface.
 */

import type {
  FinanceAccountType,
  FinanceJournalEntryStatus,
  FinanceTransactionType,
} from "@/modules/platform-finance/types";

export type FinanceJournalListFilters = {
  companyId?: string | null;
  periodId?: string | null;
  /** Inclusive YYYY-MM-DD */
  dateFrom?: string | null;
  /** Inclusive YYYY-MM-DD */
  dateTo?: string | null;
  status?: FinanceJournalEntryStatus | "all" | null;
  /** Financial transaction type (source of journal). */
  sourceType?: FinanceTransactionType | "all" | null;
  /** Matches journal reference, description, or id prefix. */
  search?: string | null;
  page?: number;
  pageSize?: number;
};

export type FinanceJournalRegisterRow = {
  id: string;
  /** Authoritative journal reference (from posted FT). */
  journalNo: string;
  entryDate: string;
  periodId: string;
  periodLabel: string;
  companyId: string;
  companyName: string;
  description: string;
  sourceType: FinanceTransactionType | null;
  reference: string;
  totalDebit: number;
  totalCredit: number;
  status: FinanceJournalEntryStatus;
  transactionId: string;
  postedAt: string;
};

export type FinanceJournalRegisterResult = {
  rows: FinanceJournalRegisterRow[];
  total: number;
  page: number;
  pageSize: number;
};

export type FinanceJournalDetailLine = {
  id: string;
  lineNo: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: FinanceAccountType;
  description: string | null;
  debit: number;
  credit: number;
};

export type FinanceJournalDetail = {
  id: string;
  journalNo: string;
  description: string;
  status: FinanceJournalEntryStatus;
  sourceType: FinanceTransactionType | null;
  reference: string;
  transactionId: string;
  transactionReference: string;
  /** No FT detail route in product yet — always false for now. */
  transactionHref: string | null;
  companyId: string;
  companyName: string;
  periodId: string;
  periodLabel: string;
  entryDate: string;
  createdByName: string | null;
  createdAt: string;
  postedByName: string | null;
  postedAt: string;
  lines: FinanceJournalDetailLine[];
  totalDebit: number;
  totalCredit: number;
  balanced: boolean;
};
