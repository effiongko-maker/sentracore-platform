/**
 * Reports — formal statements over POSTED accounting only.
 *
 * Every figure here is computed from PostedAccountMovement rows (finance_trial_balance_v, itself derived from
 * finance_general_ledger_v where status = 'posted') by the SAME builders the Accounting views use
 * (buildProfitAndLoss / buildBalanceSheet / buildTrialBalance). A comparative figure is a second, independent build
 * over the same movements for another period — nothing derived is stored, and a comparative period that does not
 * exist in the company calendar is reported as unavailable, never as zero.
 */
import {
  foldCumulativeByAccount,
  isPeriodOnOrBefore,
  isSamePeriod,
  roundMoney2,
  type PostedAccountMovement,
} from "@/modules/platform-finance/domain/accountingReadModels";
import {
  buildProfitAndLoss,
  type FinanceProfitAndLossLine,
  type FinanceProfitAndLossResult,
  type FinanceProfitAndLossScope,
} from "@/modules/platform-finance/domain/profitAndLoss";
import {
  UNCLOSED_EARNINGS_LABEL,
  buildBalanceSheet,
  type FinanceBalanceSheetResult,
} from "@/modules/platform-finance/domain/balanceSheet";
import { buildTrialBalance } from "@/modules/platform-finance/domain/trialBalance";
import { financePeriodLabel, periodOrdinal } from "@/modules/platform-finance/domain/periods";

export type ReportPeriod = { id: string; year: number; month: number; startDate: string; endDate: string; status: string };

export type FinanceComparisonMode = "none" | "prior_period" | "prior_year";

export type ComparativeResolution =
  | { mode: "none"; period: null; unavailableReason: null }
  | { mode: Exclude<FinanceComparisonMode, "none">; period: ReportPeriod; unavailableReason: null }
  | { mode: Exclude<FinanceComparisonMode, "none">; period: null; unavailableReason: string };

export function parseComparisonMode(value: unknown): FinanceComparisonMode {
  return value === "prior_period" || value === "prior_year" ? value : "none";
}

/** The comparative period must exist in the company's own calendar; it is never synthesised. */
export function resolveComparativePeriod(
  periods: readonly ReportPeriod[],
  base: Pick<ReportPeriod, "year" | "month">,
  mode: FinanceComparisonMode
): ComparativeResolution {
  if (mode === "none") return { mode, period: null, unavailableReason: null };
  const target =
    mode === "prior_year"
      ? { year: base.year - 1, month: base.month }
      : base.month === 1
        ? { year: base.year - 1, month: 12 }
        : { year: base.year, month: base.month - 1 };
  const period = periods.find((p) => p.year === target.year && p.month === target.month) ?? null;
  if (!period) {
    return {
      mode,
      period: null,
      unavailableReason: `No accounting period exists for ${financePeriodLabel(target.year, target.month)}, so there is no comparative to report.`,
    };
  }
  return { mode, period, unavailableReason: null };
}

export function hasPostedActivity(
  movements: readonly PostedAccountMovement[],
  predicate: (row: PostedAccountMovement) => boolean
): boolean {
  return movements.some((row) => predicate(row) && (row.totalDebit !== 0 || row.totalCredit !== 0));
}

// ── Comparative merge ────────────────────────────────────────────────────────────────────────────────────────

export type ComparedLine = {
  accountId: string | null;
  accountCode: string;
  accountName: string;
  current: number;
  /** null only when there is no comparative column at all. */
  comparative: number | null;
  variance: number | null;
  derived?: boolean;
};

export type ComparedSection = {
  key: string;
  label: string;
  totalLabel: string;
  lines: ComparedLine[];
  current: number;
  comparative: number | null;
  variance: number | null;
};

export type ComparedFigure = { label: string; current: number; comparative: number | null; variance: number | null };

function variance(current: number, comparative: number | null): number | null {
  return comparative === null ? null : roundMoney2(current - comparative);
}

function mergeLines(
  current: readonly FinanceProfitAndLossLine[],
  comparative: readonly FinanceProfitAndLossLine[] | null
): ComparedLine[] {
  const byId = new Map<string, ComparedLine>();
  for (const row of current) {
    byId.set(row.accountId, {
      accountId: row.accountId,
      accountCode: row.accountCode,
      accountName: row.accountName,
      current: row.amount,
      comparative: comparative ? 0 : null,
      variance: null,
    });
  }
  for (const row of comparative ?? []) {
    const existing = byId.get(row.accountId);
    if (existing) existing.comparative = row.amount;
    else
      byId.set(row.accountId, {
        accountId: row.accountId,
        accountCode: row.accountCode,
        accountName: row.accountName,
        current: 0,
        comparative: row.amount,
        variance: null,
      });
  }
  return [...byId.values()]
    .map((line) => ({ ...line, variance: variance(line.current, line.comparative) }))
    .sort((a, b) => a.accountCode.localeCompare(b.accountCode, "en"));
}

function section(
  key: string,
  label: string,
  totalLabel: string,
  current: readonly FinanceProfitAndLossLine[],
  currentTotal: number,
  comparative: readonly FinanceProfitAndLossLine[] | null,
  comparativeTotal: number | null
): ComparedSection {
  return {
    key,
    label,
    totalLabel,
    lines: mergeLines(current, comparative),
    current: currentTotal,
    comparative: comparativeTotal,
    variance: variance(currentTotal, comparativeTotal),
  };
}

function figure(label: string, current: number, comparative: number | null): ComparedFigure {
  return { label, current, comparative, variance: variance(current, comparative) };
}

// ── Profit & Loss ────────────────────────────────────────────────────────────────────────────────────────────

export type ProfitAndLossReport = {
  scope: FinanceProfitAndLossScope;
  currentLabel: string;
  comparativeLabel: string | null;
  comparativeUnavailableReason: string | null;
  currentHasActivity: boolean;
  comparativeHasActivity: boolean | null;
  sections: ComparedSection[];
  grossProfit: ComparedFigure;
  netProfit: ComparedFigure;
  /** Each column is an independent build — exposed so totals can be reconciled to the Accounting P&L. */
  current: FinanceProfitAndLossResult;
  comparative: FinanceProfitAndLossResult | null;
};

function pnlLabel(scope: FinanceProfitAndLossScope, period: Pick<ReportPeriod, "year" | "month">): string {
  const name = financePeriodLabel(period.year, period.month);
  return scope === "ytd" ? `Year to ${name}` : name;
}

function pnlActivityPredicate(scope: FinanceProfitAndLossScope, period: Pick<ReportPeriod, "year" | "month">) {
  return (row: PostedAccountMovement) =>
    (row.accountType === "revenue" || row.accountType === "expense") &&
    (scope === "ytd" ? row.year === period.year && row.month <= period.month : isSamePeriod(row, period));
}

export function buildProfitAndLossReport(input: {
  companyId: string;
  period: ReportPeriod;
  scope: FinanceProfitAndLossScope;
  comparison: ComparativeResolution;
  movements: readonly PostedAccountMovement[];
}): ProfitAndLossReport {
  const build = (period: ReportPeriod) =>
    buildProfitAndLoss({
      companyId: input.companyId,
      periodId: period.id,
      scope: input.scope,
      period: { year: period.year, month: period.month },
      heading: "Profit & Loss",
      subheading: pnlLabel(input.scope, period),
      movements: input.movements,
    });
  const current = build(input.period);
  const comparativePeriod = input.comparison.period;
  const comparative = comparativePeriod ? build(comparativePeriod) : null;
  const c = comparative;
  return {
    scope: input.scope,
    currentLabel: pnlLabel(input.scope, input.period),
    comparativeLabel: comparativePeriod ? pnlLabel(input.scope, comparativePeriod) : null,
    comparativeUnavailableReason: input.comparison.unavailableReason,
    currentHasActivity: hasPostedActivity(input.movements, pnlActivityPredicate(input.scope, input.period)),
    comparativeHasActivity: comparativePeriod
      ? hasPostedActivity(input.movements, pnlActivityPredicate(input.scope, comparativePeriod))
      : null,
    sections: [
      section("revenue", "Project / Operating Revenue", "Total Revenue", current.revenue, current.totalRevenue, c?.revenue ?? null, c?.totalRevenue ?? null),
      section("direct", "Direct Costs", "Total Direct Costs", current.directCosts, current.totalDirectCosts, c?.directCosts ?? null, c?.totalDirectCosts ?? null),
      section("other", "Other Income", "Total Other Income", current.otherIncome, current.totalOtherIncome, c?.otherIncome ?? null, c?.totalOtherIncome ?? null),
      section("opex", "Operating Expenses", "Total Operating Expenses", current.operatingExpenses, current.totalOperatingExpenses, c?.operatingExpenses ?? null, c?.totalOperatingExpenses ?? null),
    ],
    grossProfit: figure("Gross Profit", current.grossProfit, c?.grossProfit ?? null),
    netProfit: figure("Net Profit / (Loss)", current.netProfit, c?.netProfit ?? null),
    current,
    comparative,
  };
}

// ── Balance Sheet ────────────────────────────────────────────────────────────────────────────────────────────

export type BalanceSheetReport = {
  currentLabel: string;
  comparativeLabel: string | null;
  comparativeUnavailableReason: string | null;
  currentHasActivity: boolean;
  comparativeHasActivity: boolean | null;
  sections: ComparedSection[];
  totalAssets: ComparedFigure;
  totalLiabilitiesAndEquity: ComparedFigure;
  balanced: boolean;
  comparativeBalanced: boolean | null;
  disclosure: string;
  current: FinanceBalanceSheetResult;
  comparative: FinanceBalanceSheetResult | null;
};

function asAtLabel(period: Pick<ReportPeriod, "endDate">): string {
  const date = new Date(`${period.endDate}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? `As at ${period.endDate}`
    : `As at ${date.toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })}`;
}

export function buildBalanceSheetReport(input: {
  companyId: string;
  period: ReportPeriod;
  comparison: ComparativeResolution;
  movements: readonly PostedAccountMovement[];
}): BalanceSheetReport {
  const build = (period: ReportPeriod) =>
    buildBalanceSheet({
      companyId: input.companyId,
      periodId: period.id,
      asAtDate: period.endDate,
      asAtLabel: asAtLabel(period),
      asOf: { year: period.year, month: period.month },
      movements: input.movements,
    });
  const current = build(input.period);
  const comparativePeriod = input.comparison.period;
  const c = comparativePeriod ? build(comparativePeriod) : null;
  const equityLines = (bs: FinanceBalanceSheetResult) => [
    ...bs.equity,
    { accountId: "__unclosed_earnings__", accountCode: "", accountName: UNCLOSED_EARNINGS_LABEL, amount: bs.unclosedEarnings },
  ];
  const equity = section("equity", "Equity", "Total Equity", equityLines(current), current.totalEquity, c ? equityLines(c) : null, c?.totalEquity ?? null);
  equity.lines = equity.lines.map((line) =>
    line.accountId === "__unclosed_earnings__" ? { ...line, accountId: null, derived: true } : line
  );
  const upTo = (period: ReportPeriod) => (row: PostedAccountMovement) => isPeriodOnOrBefore(row, period);
  return {
    currentLabel: current.asAtLabel,
    comparativeLabel: c?.asAtLabel ?? null,
    comparativeUnavailableReason: input.comparison.unavailableReason,
    currentHasActivity: hasPostedActivity(input.movements, upTo(input.period)),
    comparativeHasActivity: comparativePeriod ? hasPostedActivity(input.movements, upTo(comparativePeriod)) : null,
    sections: [
      section("assets", "Assets", "Total Assets", current.assets, current.totalAssets, c?.assets ?? null, c?.totalAssets ?? null),
      section("liabilities", "Liabilities", "Total Liabilities", current.liabilities, current.totalLiabilities, c?.liabilities ?? null, c?.totalLiabilities ?? null),
      equity,
    ],
    totalAssets: figure("Total Assets", current.totalAssets, c?.totalAssets ?? null),
    totalLiabilitiesAndEquity: figure("Total Liabilities & Equity", current.totalLiabilitiesAndEquity, c?.totalLiabilitiesAndEquity ?? null),
    balanced: current.balanced,
    comparativeBalanced: c ? c.balanced : null,
    disclosure: current.disclosure,
    current,
    comparative: c,
  };
}

// ── Trial Balance with movements ─────────────────────────────────────────────────────────────────────────────

export type TrialBalanceMovementRow = {
  accountId: string;
  accountCode: string;
  accountName: string;
  accountType: string;
  openingDebit: number;
  openingCredit: number;
  periodDebit: number;
  periodCredit: number;
  closingDebit: number;
  closingCredit: number;
};

export type TrialBalanceMovementReport = {
  asAtLabel: string;
  periodLabel: string;
  rows: TrialBalanceMovementRow[];
  totals: Omit<TrialBalanceMovementRow, "accountId" | "accountCode" | "accountName" | "accountType">;
  balanced: boolean;
  hasActivity: boolean;
  disclosure: string;
};

export function buildTrialBalanceMovementReport(input: {
  companyId: string;
  period: ReportPeriod;
  movements: readonly PostedAccountMovement[];
}): TrialBalanceMovementReport {
  const { period, movements } = input;
  const ordinal = periodOrdinal(period.year, period.month);
  const opening = new Map(
    foldCumulativeByAccount(movements, (row) => periodOrdinal(row.year, row.month) < ordinal).map((r) => [r.accountId, r])
  );
  const inPeriod = new Map(foldCumulativeByAccount(movements, (row) => isSamePeriod(row, period)).map((r) => [r.accountId, r]));
  // Closing balances come from the Accounting Trial Balance builder itself, so the two cannot drift.
  const closingTb = buildTrialBalance({
    companyId: input.companyId,
    periodId: period.id,
    asAtDate: period.endDate,
    asAtLabel: asAtLabel(period),
    asOf: { year: period.year, month: period.month },
    movements,
  });
  const closing = new Map(closingTb.rows.map((r) => [r.accountId, r]));
  const accounts = new Map(
    foldCumulativeByAccount(movements, (row) => isPeriodOnOrBefore(row, period)).map((r) => [r.accountId, r])
  );
  const rows: TrialBalanceMovementRow[] = [...accounts.values()]
    .map((account) => {
      const o = opening.get(account.accountId);
      const m = inPeriod.get(account.accountId);
      const c = closing.get(account.accountId);
      return {
        accountId: account.accountId,
        accountCode: account.accountCode,
        accountName: account.accountName,
        accountType: account.accountType,
        openingDebit: o?.debitBalance ?? 0,
        openingCredit: o?.creditBalance ?? 0,
        periodDebit: m?.totalDebit ?? 0,
        periodCredit: m?.totalCredit ?? 0,
        closingDebit: c?.debit ?? 0,
        closingCredit: c?.credit ?? 0,
      };
    })
    .filter((r) => r.openingDebit || r.openingCredit || r.periodDebit || r.periodCredit || r.closingDebit || r.closingCredit);
  const sum = (key: keyof TrialBalanceMovementReport["totals"]) => roundMoney2(rows.reduce((s, r) => s + r[key], 0));
  const totals = {
    openingDebit: sum("openingDebit"),
    openingCredit: sum("openingCredit"),
    periodDebit: sum("periodDebit"),
    periodCredit: sum("periodCredit"),
    closingDebit: sum("closingDebit"),
    closingCredit: sum("closingCredit"),
  };
  return {
    asAtLabel: closingTb.asAtLabel,
    periodLabel: financePeriodLabel(period.year, period.month),
    rows,
    totals,
    balanced:
      Math.abs(totals.openingDebit - totals.openingCredit) < 0.005 &&
      Math.abs(totals.periodDebit - totals.periodCredit) < 0.005 &&
      Math.abs(totals.closingDebit - totals.closingCredit) < 0.005,
    hasActivity: rows.length > 0,
    disclosure: closingTb.disclosure,
  };
}
