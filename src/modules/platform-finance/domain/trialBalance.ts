import {
  OPENING_BALANCE_DISCLOSURE,
  foldCumulativeByAccount,
  isPeriodOnOrBefore,
  roundMoney2,
  type PostedAccountMovement,
} from "@/modules/platform-finance/domain/accountingReadModels";

export const TRIAL_BALANCE_OPENING_DISCLOSURE = OPENING_BALANCE_DISCLOSURE;

export type FinanceTrialBalanceLine = {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
};

export type FinanceTrialBalanceResult = {
  companyId: string;
  periodId: string;
  asAtDate: string;
  asAtLabel: string;
  rows: FinanceTrialBalanceLine[];
  totalDebit: number;
  totalCredit: number;
  difference: number;
  balanced: boolean;
  disclosure: string;
};

export function buildTrialBalance(input: {
  companyId: string;
  periodId: string;
  asAtDate: string;
  asAtLabel: string;
  asOf: { year: number; month: number };
  movements: readonly PostedAccountMovement[];
}): FinanceTrialBalanceResult {
  const folded = foldCumulativeByAccount(input.movements, (row) =>
    isPeriodOnOrBefore(row, input.asOf)
  );
  const rows: FinanceTrialBalanceLine[] = folded
    .filter((row) => row.debitBalance !== 0 || row.creditBalance !== 0)
    .map((row) => ({
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      debit: row.debitBalance,
      credit: row.creditBalance,
    }));
  const totalDebit = roundMoney2(rows.reduce((sum, row) => sum + row.debit, 0));
  const totalCredit = roundMoney2(rows.reduce((sum, row) => sum + row.credit, 0));
  const difference = roundMoney2(totalDebit - totalCredit);
  return {
    companyId: input.companyId,
    periodId: input.periodId,
    asAtDate: input.asAtDate,
    asAtLabel: input.asAtLabel,
    rows,
    totalDebit,
    totalCredit,
    difference,
    balanced: Math.abs(difference) < 0.005,
    disclosure: TRIAL_BALANCE_OPENING_DISCLOSURE,
  };
}