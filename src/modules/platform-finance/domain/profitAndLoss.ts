import {
  expenseActivityAmount,
  foldCumulativeByAccount,
  isDirectExpense,
  isOperatingOrUnclassifiedExpense,
  isOtherIncome,
  isProjectOrOperatingRevenue,
  isSamePeriod,
  isYearToDate,
  revenueActivityAmount,
  roundMoney2,
  type PostedAccountMovement,
} from "@/modules/platform-finance/domain/accountingReadModels";

export type FinanceProfitAndLossScope = "period" | "ytd";

export type FinanceProfitAndLossLine = {
  accountId: string;
  accountCode: string;
  accountName: string;
  amount: number;
};

export type FinanceProfitAndLossResult = {
  companyId: string;
  periodId: string;
  scope: FinanceProfitAndLossScope;
  heading: string;
  subheading: string;
  revenue: FinanceProfitAndLossLine[];
  totalRevenue: number;
  directCosts: FinanceProfitAndLossLine[];
  totalDirectCosts: number;
  grossProfit: number;
  otherIncome: FinanceProfitAndLossLine[];
  totalOtherIncome: number;
  operatingExpenses: FinanceProfitAndLossLine[];
  totalOperatingExpenses: number;
  netProfit: number;
};

function activityLines(
  rows: ReturnType<typeof foldCumulativeByAccount>,
  include: (row: (typeof rows)[number]) => boolean,
  amountOf: (row: (typeof rows)[number]) => number
): FinanceProfitAndLossLine[] {
  return rows
    .filter(include)
    .map((row) => ({
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      amount: amountOf(row),
    }))
    .filter((row) => row.amount !== 0);
}

export function buildProfitAndLoss(input: {
  companyId: string;
  periodId: string;
  scope: FinanceProfitAndLossScope;
  period: { year: number; month: number };
  heading: string;
  subheading: string;
  movements: readonly PostedAccountMovement[];
}): FinanceProfitAndLossResult {
  const predicate =
    input.scope === "ytd"
      ? (row: PostedAccountMovement) => isYearToDate(row, input.period)
      : (row: PostedAccountMovement) => isSamePeriod(row, input.period);
  const folded = foldCumulativeByAccount(input.movements, predicate);

  const revenue = activityLines(
    folded,
    (row) => isProjectOrOperatingRevenue(row.accountType, row.classification),
    (row) => revenueActivityAmount(row.totalDebit, row.totalCredit)
  );
  const directCosts = activityLines(
    folded,
    (row) => isDirectExpense(row.accountType, row.classification),
    (row) => expenseActivityAmount(row.totalDebit, row.totalCredit)
  );
  const otherIncome = activityLines(
    folded,
    (row) => isOtherIncome(row.accountType, row.classification),
    (row) => revenueActivityAmount(row.totalDebit, row.totalCredit)
  );
  const operatingExpenses = activityLines(
    folded,
    (row) => isOperatingOrUnclassifiedExpense(row.accountType, row.classification),
    (row) => expenseActivityAmount(row.totalDebit, row.totalCredit)
  );

  const totalRevenue = roundMoney2(revenue.reduce((sum, row) => sum + row.amount, 0));
  const totalDirectCosts = roundMoney2(
    directCosts.reduce((sum, row) => sum + row.amount, 0)
  );
  const grossProfit = roundMoney2(totalRevenue - totalDirectCosts);
  const totalOtherIncome = roundMoney2(
    otherIncome.reduce((sum, row) => sum + row.amount, 0)
  );
  const totalOperatingExpenses = roundMoney2(
    operatingExpenses.reduce((sum, row) => sum + row.amount, 0)
  );
  const netProfit = roundMoney2(
    grossProfit + totalOtherIncome - totalOperatingExpenses
  );

  return {
    companyId: input.companyId,
    periodId: input.periodId,
    scope: input.scope,
    heading: input.heading,
    subheading: input.subheading,
    revenue,
    totalRevenue,
    directCosts,
    totalDirectCosts,
    grossProfit,
    otherIncome,
    totalOtherIncome,
    operatingExpenses,
    totalOperatingExpenses,
    netProfit,
  };
}