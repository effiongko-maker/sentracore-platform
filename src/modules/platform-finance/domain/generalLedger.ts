/**
 * General Ledger v1 — posted journal-line activity register.
 * Derived from finance_general_ledger_v. Account-scoped. No running balance.
 */

export type FinanceGeneralLedgerFilters = {
  companyId: string;
  /** Required before rows load. */
  accountId: string;
  /** Optional; retained for API compatibility. Not used by the primary GL UI. */
  periodId?: string | null;
  /** Inclusive YYYY-MM-DD. Optional. */
  dateFrom?: string | null;
  /** Inclusive YYYY-MM-DD. Optional. */
  dateTo?: string | null;
  /** Matches journal reference, entry description, or line description. */
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
  preparedByName: string | null;
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