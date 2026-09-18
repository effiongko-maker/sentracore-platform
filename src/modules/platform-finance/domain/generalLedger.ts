/**
 * General Ledger v1 — posted journal-line activity register.
 * Derived from finance_general_ledger_v. No running balance.
 */

export type FinanceGeneralLedgerFilters = {
  companyId: string;
  periodId: string;
  /** Inclusive YYYY-MM-DD; must fall within the selected period. */
  dateFrom: string;
  /** Inclusive YYYY-MM-DD; must fall within the selected period. */
  dateTo: string;
  accountId?: string | null;
  /** Matches journal reference, entry/line description, account code, or name. */
  search?: string | null;
  page?: number;
  pageSize?: number;
};

export type FinanceGeneralLedgerRow = {
  /** Journal line id (row key). */
  id: string;
  journalEntryId: string;
  entryDate: string;
  reference: string;
  description: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};

export type FinanceGeneralLedgerResult = {
  rows: FinanceGeneralLedgerRow[];
  /** Matching journal line count (pagination unit). */
  total: number;
  page: number;
  pageSize: number;
  /** Debit/credit sums for the entire filtered result — not the current page. */
  totalDebit: number;
  totalCredit: number;
};
