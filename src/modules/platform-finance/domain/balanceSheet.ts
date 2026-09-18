import {
  OPENING_BALANCE_DISCLOSURE,
  assetBalanceAmount,
  creditNormalBalanceAmount,
  derivedUnclosedEarnings,
  foldCumulativeByAccount,
  isPeriodOnOrBefore,
  roundMoney2,
  type PostedAccountMovement,
} from "@/modules/platform-finance/domain/accountingReadModels";

export const BALANCE_SHEET_OPENING_DISCLOSURE = OPENING_BALANCE_DISCLOSURE;
export const UNCLOSED_EARNINGS_LABEL = "Unclosed Earnings (derived)";

export type FinanceBalanceSheetLine = {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
  derived?: boolean;
};

export type FinanceBalanceSheetResult = {
  companyId: string;
  periodId: string;
  asAtDate: string;
  asAtLabel: string;
  assets: FinanceBalanceSheetLine[];
  totalAssets: number;
  liabilities: FinanceBalanceSheetLine[];
  totalLiabilities: number;
  equity: FinanceBalanceSheetLine[];
  postedEquityTotal: number;
  unclosedEarnings: number;
  totalEquity: number;
  totalLiabilitiesAndEquity: number;
  difference: number;
  balanced: boolean;
  disclosure: string;
};

function typedLines(
  rows: ReturnType<typeof foldCumulativeByAccount>,
  accountType: "asset" | "liability" | "equity",
  amountOf: (row: (typeof rows)[number]) => number
): FinanceBalanceSheetLine[] {
  return rows
    .filter((row) => row.accountType === accountType)
    .map((row) => ({
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: amountOf(row),
    }))
    .filter((row) => row.amount !== 0);
}

export function buildBalanceSheet(input: {
  companyId: string;
  periodId: string;
  asAtDate: string;
  asAtLabel: string;
  asOf: { year: number; month: number };
  movements: readonly PostedAccountMovement[];
}): FinanceBalanceSheetResult {
  const folded = foldCumulativeByAccount(input.movements, (row) =>
    isPeriodOnOrBefore(row, input.asOf)
  );

  const assets = typedLines(folded, "asset", (row) =>
    assetBalanceAmount(row.totalDebit, row.totalCredit)
  );
  const liabilities = typedLines(folded, "liability", (row) =>
    creditNormalBalanceAmount(row.totalDebit, row.totalCredit)
  );
  const equity = typedLines(folded, "equity", (row) =>
    creditNormalBalanceAmount(row.totalDebit, row.totalCredit)
  );

  const totalAssets = roundMoney2(assets.reduce((sum, row) => sum + row.amount, 0));
  const totalLiabilities = roundMoney2(
    liabilities.reduce((sum, row) => sum + row.amount, 0)
  );
  const postedEquityTotal = roundMoney2(
    equity.reduce((sum, row) => sum + row.amount, 0)
  );
  const unclosedEarnings = derivedUnclosedEarnings(folded);
  const totalEquity = roundMoney2(postedEquityTotal + unclosedEarnings);
  const totalLiabilitiesAndEquity = roundMoney2(totalLiabilities + totalEquity);
  const difference = roundMoney2(totalAssets - totalLiabilitiesAndEquity);

  return {
    companyId: input.companyId,
    periodId: input.periodId,
    asAtDate: input.asAtDate,
    asAtLabel: input.asAtLabel,
    assets,
    totalAssets,
    liabilities,
    totalLiabilities,
    equity,
    postedEquityTotal,
    unclosedEarnings,
    totalEquity,
    totalLiabilitiesAndEquity,
    difference,
    balanced: Math.abs(difference) < 0.005,
    disclosure: BALANCE_SHEET_OPENING_DISCLOSURE,
  };
}