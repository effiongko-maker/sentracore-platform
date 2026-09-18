/**
 * Shared posted-book read-model helpers for Trial Balance, P&L, and Balance Sheet.
 * Source grain: finance_trial_balance_v period × account movement.
 */

import type { FinanceAccountType } from "@/modules/platform-finance/types";
import { periodOrdinal } from "@/modules/platform-finance/domain/periods";

export const OPENING_BALANCE_CLEARING_CODE = "3020";

export const OPENING_BALANCE_DISCLOSURE =
  "Opening balances are still being established. This statement reflects accounting activity currently posted in SentraCore.";

export type PostedAccountMovement = {
  periodId: string;
  year: number;
  month: number;
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: FinanceAccountType;
  classification: string | null;
  totalDebit: number;
  totalCredit: number;
};

export type CumulativeAccountBalance = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: FinanceAccountType;
  classification: string | null;
  totalDebit: number;
  totalCredit: number;
  netDebit: number;
  debitBalance: number;
  creditBalance: number;
};

export function roundMoney2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function isPeriodOnOrBefore(
  row: Pick<PostedAccountMovement, "year" | "month">,
  asOf: { year: number; month: number }
): boolean {
  return periodOrdinal(row.year, row.month) <= periodOrdinal(asOf.year, asOf.month);
}

export function isSamePeriod(
  row: Pick<PostedAccountMovement, "year" | "month">,
  period: { year: number; month: number }
): boolean {
  return row.year === period.year && row.month === period.month;
}

export function isYearToDate(
  row: Pick<PostedAccountMovement, "year" | "month">,
  period: { year: number; month: number }
): boolean {
  return row.year === period.year && row.month <= period.month;
}

export function foldCumulativeByAccount(
  rows: readonly PostedAccountMovement[],
  predicate: (row: PostedAccountMovement) => boolean = () => true
): CumulativeAccountBalance[] {
  const byAccount = new Map<string, CumulativeAccountBalance>();
  for (const row of rows) {
    if (!predicate(row)) continue;
    const existing = byAccount.get(row.accountId);
    const totalDebit = roundMoney2((existing?.totalDebit ?? 0) + row.totalDebit);
    const totalCredit = roundMoney2((existing?.totalCredit ?? 0) + row.totalCredit);
    const netDebit = roundMoney2(totalDebit - totalCredit);
    byAccount.set(row.accountId, {
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      accountType: row.accountType,
      classification: row.classification,
      totalDebit,
      totalCredit,
      netDebit,
      debitBalance: netDebit > 0 ? netDebit : 0,
      creditBalance: netDebit < 0 ? roundMoney2(-netDebit) : 0,
    });
  }
  return [...byAccount.values()].sort((a, b) =>
    a.accountCode.localeCompare(b.accountCode, "en")
  );
}

export function revenueActivityAmount(totalDebit: number, totalCredit: number): number {
  return roundMoney2(totalCredit - totalDebit);
}

export function expenseActivityAmount(totalDebit: number, totalCredit: number): number {
  return roundMoney2(totalDebit - totalCredit);
}

export function assetBalanceAmount(totalDebit: number, totalCredit: number): number {
  return roundMoney2(totalDebit - totalCredit);
}

export function creditNormalBalanceAmount(
  totalDebit: number,
  totalCredit: number
): number {
  return roundMoney2(totalCredit - totalDebit);
}

export function classificationOf(value: string | null | undefined): string {
  return (value ?? "").trim().toLowerCase();
}

export function isProjectRevenue(
  accountType: string,
  classification: string | null | undefined
): boolean {
  return accountType === "revenue" && classificationOf(classification) === "project_revenue";
}

export function isOtherIncome(
  accountType: string,
  classification: string | null | undefined
): boolean {
  return accountType === "revenue" && classificationOf(classification) === "other_income";
}

export function isDirectExpense(
  accountType: string,
  classification: string | null | undefined
): boolean {
  return (
    accountType === "expense" &&
    classificationOf(classification).startsWith("direct_expense_")
  );
}

export function isOperatingExpense(
  accountType: string,
  classification: string | null | undefined
): boolean {
  return (
    accountType === "expense" &&
    classificationOf(classification).startsWith("operating_expense_")
  );
}

/** Unmatched revenue is presented with project/operating revenue, not other income. */
export function isProjectOrOperatingRevenue(
  accountType: string,
  classification: string | null | undefined
): boolean {
  return accountType === "revenue" && !isOtherIncome(accountType, classification);
}

/** Unmatched expenses are presented with operating expenses so activity is not dropped. */
export function isOperatingOrUnclassifiedExpense(
  accountType: string,
  classification: string | null | undefined
): boolean {
  return accountType === "expense" && !isDirectExpense(accountType, classification);
}

/**
 * All unclosed P&L activity in the supplied balances.
 * Not posted to 3010. Not a GL account.
 */
export function derivedUnclosedEarnings(
  balances: readonly CumulativeAccountBalance[]
): number {
  let revenue = 0;
  let expense = 0;
  for (const row of balances) {
    if (row.accountType === "revenue") {
      revenue = roundMoney2(
        revenue + revenueActivityAmount(row.totalDebit, row.totalCredit)
      );
    } else if (row.accountType === "expense") {
      expense = roundMoney2(
        expense + expenseActivityAmount(row.totalDebit, row.totalCredit)
      );
    }
  }
  return roundMoney2(revenue - expense);
}