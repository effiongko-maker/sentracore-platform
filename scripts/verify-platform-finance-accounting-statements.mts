/**
 * Platform Finance Accounting statements — GL polish + TB/P&L/BS read models.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-accounting-statements.mts
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  OPENING_BALANCE_CLEARING_CODE,
  derivedUnclosedEarnings,
  expenseActivityAmount,
  isDirectExpense,
  isOperatingExpense,
  isOtherIncome,
  isProjectRevenue,
  revenueActivityAmount,
  type PostedAccountMovement,
} from "../src/modules/platform-finance/domain/accountingReadModels";
import { buildTrialBalance } from "../src/modules/platform-finance/domain/trialBalance";
import { buildProfitAndLoss } from "../src/modules/platform-finance/domain/profitAndLoss";
import { buildBalanceSheet } from "../src/modules/platform-finance/domain/balanceSheet";
import { PAYCHEX_AUTHORITATIVE_COA } from "../src/modules/platform-finance/domain/coa";
import { PLATFORM_FINANCE_CAPABILITIES } from "../src/modules/platform-finance/types";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function almostEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 0.005;
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function movement(
  partial: Omit<PostedAccountMovement, "accountId"> & { accountId?: string }
): PostedAccountMovement {
  return {
    accountId: partial.accountId ?? partial.accountCode,
    ...partial,
  };
}

function main() {
  assert(
    existsSync("src/app/(app)/platform-finance/accounting/trial-balance/page.tsx"),
    "TB route"
  );
  assert(
    existsSync(
      "src/app/(app)/platform-finance/accounting/profit-and-loss/page.tsx"
    ),
    "P&L route"
  );
  assert(
    existsSync("src/app/(app)/platform-finance/accounting/balance-sheet/page.tsx"),
    "BS route"
  );
  assert(
    !existsSync("src/app/(app)/platform-finance/accounting/cash-flow/page.tsx"),
    "no Cash Flow route"
  );

  const nav = readSrc("src/modules/platform-finance/nav.ts");
  assert(nav.includes('href: "/platform-finance/accounting/general-ledger"'), "GL live");
  assert(nav.includes('href: "/platform-finance/accounting/trial-balance"'), "TB live");
  assert(nav.includes('href: "/platform-finance/accounting/profit-and-loss"'), "P&L live");
  assert(nav.includes('href: "/platform-finance/accounting/balance-sheet"'), "BS live");
  assert(
    nav.includes('href: null,\n        label: "Cash Flow"') ||
      nav.includes('{ href: null, label: "Cash Flow"'),
    "Cash Flow comingSoon"
  );
  assert(nav.includes('comingSoon: true'), "Cash Flow / Reports still comingSoon");
  assert(nav.includes('label: "Reports"') && nav.includes("comingSoon: true"), "Reports dark");

  const route = readSrc("src/app/api/platform-finance/route.ts");
  for (const action of [
    "listGeneralLedger",
    "getTrialBalance",
    "getProfitAndLoss",
    "getBalanceSheet",
  ]) {
    assert(route.includes(`"${action}"`), `${action} action`);
  }
  assert(
    route.includes("PLATFORM_FINANCE_CAPABILITIES.view") &&
      !route.includes("platform_finance.ledger") &&
      !route.includes("platform_finance.report") &&
      !route.includes("platform_finance.trial_balance") &&
      !route.includes("platform_finance.statement"),
    "reuses platform_finance.view; no new statement capabilities"
  );

  const repo = readSrc(
    "src/modules/platform-finance/server/PlatformFinanceRepository.ts"
  );
  assert(!repo.includes("debit.sum()"), "no PostgREST debit aggregate");
  assert(!repo.includes("credit.sum()"), "no PostgREST credit aggregate");
  assert(repo.includes("sumGeneralLedgerDebitCredit"), "GL totals scan");
  assert(repo.includes('select("debit, credit")'), "totals select debit/credit only");
  assert(repo.includes("listPostedAccountMovements"), "TB/P&L/BS source query");
  assert(repo.includes("finance_trial_balance_v"), "statements use TB view");
  assert(repo.includes("finance_general_ledger_v"), "GL uses posted line view");
  assert(
    !repo.includes("account_code.ilike") && !repo.includes("account_name.ilike"),
    "GL search does not include account code/name"
  );

  const service = readSrc(
    "src/modules/platform-finance/server/PlatformFinanceServerService.ts"
  );
  assert(service.includes("GL account is required."), "account required");
  assert(service.includes("requireCompanyAccess"), "company access helper");
  assert(service.includes("buildTrialBalance"), "TB built on server");
  assert(service.includes("buildProfitAndLoss"), "P&L built on server");
  assert(service.includes("buildBalanceSheet"), "BS built on server");
  assert(!service.includes("finance_close_period"), "no close RPC in read layer");
  assert(!service.includes("Accumulated Earnings"), "does not rewrite 3010");

  const posting = readSrc("src/modules/platform-finance/server/posting.ts");
  assert(posting.includes("finance_post_transaction"), "posting untouched");

  const glPage = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceGeneralLedgerPage.tsx"
  );
  assert(
    glPage.includes("Select a GL account to view posted activity."),
    "GL empty before account"
  );
  assert(
    glPage.includes("No posted ledger activity for this account."),
    "GL empty after account"
  );
  assert(
    glPage.includes("/platform-finance/accounting/journal/"),
    "journal drill-through"
  );
  assert(!glPage.includes("totalDebit +"), "no client-side GL aggregation");
  assert(
    !/last4|institution|account_number|Restricted corporate financial account/i.test(
      glPage
    ),
    "no FA PII on GL"
  );

  const tbPage = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceTrialBalancePage.tsx"
  );
  const pnlPage = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceProfitAndLossPage.tsx"
  );
  const bsPage = readSrc(
    "src/modules/platform-finance/components/PlatformFinanceBalanceSheetPage.tsx"
  );
  assert(
    tbPage.includes("TRIAL_BALANCE_OPENING_DISCLOSURE"),
    "TB disclosure"
  );
  assert(
    bsPage.includes("BALANCE_SHEET_OPENING_DISCLOSURE"),
    "BS disclosure"
  );
  assert(
    readSrc("src/modules/platform-finance/domain/accountingReadModels.ts").includes(
      "Opening balances are still being established. This statement reflects accounting activity currently posted in SentraCore™."
    ),
    "standing opening-balance copy"
  );
  assert(
    !pnlPage.includes("Opening balances are still being established."),
    "P&L has no opening disclosure"
  );
  assert(bsPage.includes("UNCLOSED_EARNINGS_LABEL"), "derived earnings label");
  assert(bsPage.includes("pf-statement-derived"), "derived line styling");
  assert(!tbPage.includes("reduce("), "TB UI does not aggregate");
  assert(!pnlPage.includes("reduce("), "P&L UI does not aggregate");
  assert(!bsPage.includes("reduce("), "BS UI does not aggregate");

  assert(
    PLATFORM_FINANCE_CAPABILITIES.view === "platform_finance.view",
    "view capability unchanged"
  );

  const opening = PAYCHEX_AUTHORITATIVE_COA.find(
    (account) => account.code === OPENING_BALANCE_CLEARING_CODE
  );
  assert(opening?.name === "Opening Balance Clearing", "3020 name unchanged in CoA");
  assert(opening?.accountType === "equity", "3020 remains equity");

  for (const account of PAYCHEX_AUTHORITATIVE_COA) {
    if (account.accountType === "revenue") {
      assert(
        isProjectRevenue(account.accountType, account.classification) ||
          isOtherIncome(account.accountType, account.classification),
        `revenue ${account.code} classified`
      );
    }
    if (account.accountType === "expense") {
      assert(
        isDirectExpense(account.accountType, account.classification) ||
          isOperatingExpense(account.accountType, account.classification),
        `expense ${account.code} classified`
      );
    }
  }

  const jan = { year: 2026, month: 1, periodId: "p-jan" };
  const feb = { year: 2026, month: 2, periodId: "p-feb" };
  const movements: PostedAccountMovement[] = [
    movement({
      ...jan,
      accountCode: "1060",
      accountName: "Cash & Bank Balances",
      accountType: "asset",
      classification: "current_asset",
      totalDebit: 1050,
      totalCredit: 400,
    }),
    movement({
      ...jan,
      accountCode: "4000",
      accountName: "Facility Management Service Revenue",
      accountType: "revenue",
      classification: "project_revenue",
      totalDebit: 0,
      totalCredit: 1000,
    }),
    movement({
      ...jan,
      accountCode: "5000",
      accountName: "Direct Service Staff Wages & Benefits",
      accountType: "expense",
      classification: "direct_expense_facility_management",
      totalDebit: 400,
      totalCredit: 0,
    }),
    movement({
      ...jan,
      accountCode: "4040",
      accountName: "Other Income",
      accountType: "revenue",
      classification: "other_income",
      totalDebit: 0,
      totalCredit: 50,
    }),
    movement({
      ...jan,
      accountCode: "3020",
      accountName: "Opening Balance Clearing",
      accountType: "equity",
      classification: "equity",
      totalDebit: 0,
      totalCredit: 0,
    }),
    movement({
      ...feb,
      accountCode: "1060",
      accountName: "Cash & Bank Balances",
      accountType: "asset",
      classification: "current_asset",
      totalDebit: 300,
      totalCredit: 50,
    }),
    movement({
      ...feb,
      accountCode: "4000",
      accountName: "Facility Management Service Revenue",
      accountType: "revenue",
      classification: "project_revenue",
      totalDebit: 0,
      totalCredit: 200,
    }),
    movement({
      ...feb,
      accountCode: "6150",
      accountName: "Miscellaneous General Expenses",
      accountType: "expense",
      classification: "operating_expense_professional_other_services",
      totalDebit: 50,
      totalCredit: 0,
    }),
    movement({
      ...feb,
      accountCode: "3020",
      accountName: "Opening Balance Clearing",
      accountType: "equity",
      classification: "equity",
      totalDebit: 0,
      totalCredit: 100,
    }),
  ];

  const tbJan = buildTrialBalance({
    companyId: "co-1",
    periodId: "p-jan",
    asAtDate: "2026-01-31",
    asAtLabel: "As at 31 January 2026",
    asOf: jan,
    movements,
  });
  const cashJan = tbJan.rows.find((row) => row.accountCode === "1060");
  const revenueJan = tbJan.rows.find((row) => row.accountCode === "4000");
  assert(cashJan?.debit === 650 && cashJan.credit === 0, "TB signed net debit");
  assert(revenueJan?.credit === 1000 && revenueJan.debit === 0, "TB signed net credit");
  assert(almostEqual(tbJan.totalDebit, tbJan.totalCredit), "Jan TB balances");
  assert(
    !tbJan.rows.some((row) => row.accountCode === "3020"),
    "zero 3020 omitted in January"
  );

  const tbFeb = buildTrialBalance({
    companyId: "co-1",
    periodId: "p-feb",
    asAtDate: "2026-02-28",
    asAtLabel: "As at 28 February 2026",
    asOf: feb,
    movements,
  });
  const clearing = tbFeb.rows.find((row) => row.accountCode === "3020");
  assert(clearing?.accountName === "Opening Balance Clearing", "3020 name preserved");
  assert(clearing?.credit === 100, "3020 credit balance cumulative");
  assert(almostEqual(tbFeb.totalDebit, tbFeb.totalCredit), "Feb TB balances");

  const pnlJan = buildProfitAndLoss({
    companyId: "co-1",
    periodId: "p-jan",
    scope: "period",
    period: jan,
    heading: "Profit & Loss",
    subheading: "For January 2026",
    movements,
  });
  assert(pnlJan.totalRevenue === 1000, "period project revenue");
  assert(pnlJan.totalDirectCosts === 400, "direct costs from direct_expense_*");
  assert(pnlJan.grossProfit === 600, "gross profit excludes other income");
  assert(pnlJan.totalOtherIncome === 50, "other income separate");
  assert(pnlJan.totalOperatingExpenses === 0, "no Jan operating expenses");
  assert(pnlJan.netProfit === 650, "net = GP + other income - opex");
  assert(
    revenueActivityAmount(0, 1000) === 1000 && expenseActivityAmount(400, 0) === 400,
    "P&L sign convention"
  );

  const pnlFebPeriod = buildProfitAndLoss({
    companyId: "co-1",
    periodId: "p-feb",
    scope: "period",
    period: feb,
    heading: "Profit & Loss",
    subheading: "For February 2026",
    movements,
  });
  assert(pnlFebPeriod.totalRevenue === 200, "Feb period revenue");
  assert(pnlFebPeriod.totalDirectCosts === 0, "Feb has no direct costs");
  assert(pnlFebPeriod.grossProfit === 200, "Feb gross profit");
  assert(pnlFebPeriod.totalOperatingExpenses === 50, "operating_expense_*");
  assert(pnlFebPeriod.netProfit === 150, "Feb net profit");

  const pnlFebYtd = buildProfitAndLoss({
    companyId: "co-1",
    periodId: "p-feb",
    scope: "ytd",
    period: feb,
    heading: "Profit & Loss",
    subheading: "Year to February 2026",
    movements,
  });
  assert(pnlFebYtd.totalRevenue === 1200, "YTD revenue");
  assert(pnlFebYtd.totalDirectCosts === 400, "YTD direct costs");
  assert(pnlFebYtd.grossProfit === 800, "YTD gross profit");
  assert(pnlFebYtd.totalOtherIncome === 50, "YTD other income");
  assert(pnlFebYtd.totalOperatingExpenses === 50, "YTD operating expenses");
  assert(pnlFebYtd.netProfit === 800, "YTD net profit");

  const emptyPnl = buildProfitAndLoss({
    companyId: "co-1",
    periodId: "p-mar",
    scope: "period",
    period: { year: 2026, month: 3 },
    heading: "Profit & Loss",
    subheading: "For March 2026",
    movements,
  });
  assert(emptyPnl.netProfit === 0, "empty period is a zero statement");

  const bsFeb = buildBalanceSheet({
    companyId: "co-1",
    periodId: "p-feb",
    asAtDate: "2026-02-28",
    asAtLabel: "As at 28 February 2026",
    asOf: feb,
    movements,
  });
  assert(bsFeb.totalAssets === 900, "cumulative assets");
  assert(
    bsFeb.equity.some(
      (row) =>
        row.accountCode === "3020" && row.accountName === "Opening Balance Clearing"
    ),
    "3020 visible under actual name"
  );
  assert(bsFeb.postedEquityTotal === 100, "posted equity is 3020 only");
  assert(derivedUnclosedEarnings([]) === 0, "derived helper on empty is zero");
  assert(bsFeb.unclosedEarnings === 800, "rev-exp unclosed earnings");
  assert(bsFeb.totalEquity === 900, "posted equity + derived");
  assert(bsFeb.totalLiabilitiesAndEquity === 900, "L+E");
  assert(bsFeb.balanced, "A = L + posted equity + derived unclosed earnings");
  // The fixture's Feb 3020 credit has no matching debit in 1060 for that 100,
  // so the equation is not forced. A balancing fixture:

  const balancedMovements: PostedAccountMovement[] = [
    movement({
      ...jan,
      accountCode: "1060",
      accountName: "Cash & Bank Balances",
      accountType: "asset",
      classification: "current_asset",
      totalDebit: 1000,
      totalCredit: 0,
    }),
    movement({
      ...jan,
      accountCode: "4000",
      accountName: "Facility Management Service Revenue",
      accountType: "revenue",
      classification: "project_revenue",
      totalDebit: 0,
      totalCredit: 1000,
    }),
    movement({
      ...jan,
      accountCode: "3010",
      accountName: "Accumulated Earnings (Profit/Loss)",
      accountType: "equity",
      classification: "equity",
      totalDebit: 0,
      totalCredit: 0,
    }),
  ];
  const bsBalanced = buildBalanceSheet({
    companyId: "co-1",
    periodId: "p-jan",
    asAtDate: "2026-01-31",
    asAtLabel: "As at 31 January 2026",
    asOf: jan,
    movements: balancedMovements,
  });
  assert(bsBalanced.totalAssets === 1000, "balanced assets");
  assert(bsBalanced.postedEquityTotal === 0, "3010 untouched / unposted");
  assert(bsBalanced.unclosedEarnings === 1000, "derived earnings only");
  assert(bsBalanced.balanced, "A = L + E + derived");
  assert(
    !bsBalanced.equity.some((row) => row.accountCode === "3010"),
    "zero 3010 is not invented as a posted line"
  );

  const migrations = readdirSync(resolve("supabase/migrations"));
  assert(
    !migrations.some((name) => /accounting.?statement|trial_balance_as_of|general_ledger_sum/i.test(name)),
    "no statement migration added"
  );

  console.log("PASS verify-platform-finance-accounting-statements");
  console.log("  GL totals scan + TB/P&L/BS period-end read models");
}

main();
