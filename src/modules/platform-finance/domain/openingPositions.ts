/**
 * Phase 2E — Financial Account Opening Positions.
 * Cutover treasury truth only; not a current bank balance.
 */

import type { FinanceAccount, FinancePeriod, FinanceTransaction } from "@/modules/platform-finance/types";

export const PHASE_2E_DEFAULT_CUTOVER_DATE = "2026-10-01";
export const OPENING_BALANCE_CLEARING_CODE = "3020";
export const OPENING_BALANCE_CLEARING_NAME = "Opening Balance Clearing";
export const OPENING_POSITION_SOURCE_TYPE = "financial_account_opening_position";

export type OpeningPositionStatus = "draft" | "posted";

export type OpeningPositionFinancialAccountView =
  | {
      visibility: "visible";
      id: string;
      name: string;
      institutionName: string | null;
      last4: string | null;
      accountType: string;
      currency: string;
      controlGlAccountCode: string;
      controlGlAccountName: string;
    }
  | {
      visibility: "restricted";
      label: "Restricted corporate financial account";
    };

export type OpeningPositionReview = {
  status: OpeningPositionStatus;
  openingPosition: {
    id: string;
    financialAccountId: string;
    companyId: string;
    cutoverDate: string;
    amount: number | null;
    currency: string;
    offsetGlAccountId: string;
    financeTransactionId: string | null;
    status: OpeningPositionStatus;
  };
  financialAccount: OpeningPositionFinancialAccountView;
  companyName: string;
  debitAccount: FinanceAccount;
  creditAccount: FinanceAccount;
  transaction: FinanceTransaction;
  period: FinancePeriod | null;
  journalEntryId: string | null;
};

export type OpeningPositionListItem = {
  financialAccountId: string;
  openingPositionId: string;
  status: OpeningPositionStatus;
  amount: number | null;
  currency: string;
  cutoverDate: string;
  journalEntryId: string | null;
};

export function isPositiveOpeningAmount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isFinite(value) &&
    value > 0 &&
    Math.round(value * 100) / 100 === value
  );
}

export function normalizeOpeningAmount(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const rounded = Math.round(n * 100) / 100;
  return rounded > 0 ? rounded : null;
}
