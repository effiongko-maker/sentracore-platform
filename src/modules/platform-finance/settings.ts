/**
 * Platform Finance — Settings snapshot. Presentation contract only: what governs Finance, what is configured and
 * what still prevents a capability from operating fully. Every value is read from the live model or stated as a
 * system rule that the code enforces; nothing here is an editable setting (the model has no Finance settings table).
 */
export type FinanceReadinessState = "configured" | "system_managed" | "requires_configuration" | "not_available";

export type FinanceReadinessItem = {
  id: "chart-of-accounts" | "periods" | "posting" | "review-and-post" | "cash-bank-accounts" | "numbering" | "cash-flow";
  label: string;
  state: FinanceReadinessState;
  detail: string;
  href: string | null;
};

export type FinanceSettingsCompanyPeriods = {
  companyId: string;
  companyName: string;
  companyCode: string;
  open: number;
  closed: number;
  /** An open period covers today (UTC date) — posting dated today can proceed. */
  coversToday: boolean;
  /** Latest period end date on record, or null when the company has no periods. */
  latestEnd: string | null;
};

export type FinanceSettingsSnapshot = {
  asOf: string;
  companies: Array<{ id: string; code: string; name: string }>;
  chartOfAccounts: {
    active: number;
    inactive: number;
    byType: Record<string, number>;
    /** Accounts the posting rules use by code; `active` false = missing or inactive. */
    systemAccounts: Array<{ code: string; role: string; name: string | null; active: boolean }>;
    cashFlowClassified: boolean;
  };
  periods: FinanceSettingsCompanyPeriods[];
  cashBankAccounts: number;
  requestCategories: number;
  /** The acting user's own setup authority (from finance_capability_grants), for linking to manage pages. */
  canManageCoa: boolean;
  canManagePeriods: boolean;
  readiness: FinanceReadinessItem[];
};

/**
 * Accounts the posting rules reference BY CODE (invoice/receipt posting, supplier accrual Review & Post, opening
 * positions). Cash & bank posting instead uses each financial account's own control GL account.
 */
export const FINANCE_SYSTEM_ACCOUNTS: ReadonlyArray<{ code: string; role: string }> = [
  { code: "1070", role: "Receivables control" },
  { code: "2000", role: "Payables control" },
  { code: "3020", role: "Opening balance clearing" },
];
