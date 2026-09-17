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
  /** Journal line id (row key). */
  id: string;
  /** Parent journal entry — opens Journal Detail. */
  journalEntryId: string;
  lineNo: number;
  /** Authoritative journal / FT reference (Ref No). */
  reference: string;
  entryDate: string;
  periodId: string;
  periodLabel: string;
  companyId: string;
  description: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  preparedByName: string | null;
  transactionId: string;
};

export type FinanceJournalRegisterResult = {
  rows: FinanceJournalRegisterRow[];
  /** Matching journal line count (pagination unit). */
  total: number;
  page: number;
  pageSize: number;
  /** Debit/credit sums for lines on this page (no double-count). */
  pageDebitTotal: number;
  pageCreditTotal: number;
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
