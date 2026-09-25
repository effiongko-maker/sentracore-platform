/**
 * Platform Finance → Reports — truthfulness, source authority, permissions and accounting invariants.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-reports.mts
 *
 * Part 1 is behavioural in a REAL Postgres: the full repository migration chain applied to in-process PGlite
 * (scripts/lib/pf-pglite.ts). Journals are posted through the canonical finance_post_transaction; a draft transaction,
 * a draft journal entry and a Historical Commercial Fact are planted with distinctive amounts, then the finance views
 * are projected exactly as the Reports repositories project them and fed through the report builders.
 * Part 2 exercises the operational builders over synthetic domain rows. Part 3 checks permissions and source
 * authority statically. Never touches Supabase.
 */
import { existsSync, readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import type { PGlite } from "@electric-sql/pglite";
import { financeDatabase, PAYCHEX_ORG } from "./lib/pf-pglite";
import { PLATFORM_FINANCE_CAPABILITIES } from "../src/modules/platform-finance/types";
import type { FinancePeriod } from "../src/modules/platform-finance/types";
import type { PostedAccountMovement } from "../src/modules/platform-finance/domain/accountingReadModels";
import { buildTrialBalance } from "../src/modules/platform-finance/domain/trialBalance";
import { buildProfitAndLoss } from "../src/modules/platform-finance/domain/profitAndLoss";
import { buildBalanceSheet } from "../src/modules/platform-finance/domain/balanceSheet";
import {
  buildBalanceSheetReport,
  buildProfitAndLossReport,
  buildTrialBalanceMovementReport,
  resolveComparativePeriod,
} from "../src/modules/platform-finance/reports/statements";
import { buildGeneralLedgerReport, buildJournalReport, type JournalSourceRef, type PostedLedgerLine } from "../src/modules/platform-finance/reports/ledger";
import {
  ageingBucket,
  buildAccountingCompleteness,
  buildCollectionsReport,
  buildFinancialRequestPipeline,
  buildPayablesOutstanding,
  buildReceivablesAgeing,
  buildSupplierPaymentsReport,
  buildVendorBillPipeline,
} from "../src/modules/platform-finance/reports/operational";
import {
  FINANCE_HISTORICAL_ENTRY,
  FINANCE_REPORTS,
  FINANCE_UNAVAILABLE_REPORTS,
  canOpenFinanceReport,
} from "../src/modules/platform-finance/reports/catalogue";
import { csvEscape, financeReportCsv } from "../src/modules/platform-finance/reports/csv";
import { ledgerDrillHref, ledgerDrillRange } from "../src/modules/platform-finance/reports/drill";
import type { FinanceReportRun } from "../src/modules/platform-finance/reports/types";
import type { FinanceReceivable } from "../src/modules/platform-finance/domain/receivables";
import type { FinancePayableView } from "../src/modules/platform-finance/domain/payables";
import type { FinanceReceipt } from "../src/modules/platform-finance/domain/receipts";
import type { PaymentAccountingWorkItem } from "../src/modules/platform-finance/domain/paymentAccounting";
import type { FinanceVendorBill } from "../src/modules/platform-finance/domain/vendorBills";
import type { FinancialRequest } from "../src/modules/platform-finance/domain/requests";
import type { AccountingReviewWorkItem } from "../src/modules/platform-finance/domain/accountingReview";

let failures = 0;
async function check(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    console.log(`PASS ${name}`);
  } catch (error) {
    failures += 1;
    console.log(`FAIL ${name}\n     ${(error as Error).message}`);
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;
const src = (path: string) => readFileSync(path, "utf8");

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Part 1 — posted accounting in a real Postgres
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

const db: PGlite = await financeDatabase();
const one = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows[0]!;
const all = async <T,>(sql: string, params: unknown[] = []) => (await db.query<T>(sql, params)).rows;

const OFFICER = "b0000000-0000-4000-8000-000000000001";
await db.query("insert into auth.users (id, email) values ($1, $2)", [OFFICER, "officer@example.test"]);
await db.exec(`begin; select set_config('sentracore.bypass_profile_acl', 'on', true);
  update public.profiles set organisation_id = '${PAYCHEX_ORG}', status = 'active' where id = '${OFFICER}'; commit;`);
const COMPANY = (await one<{ id: string }>("select id from public.finance_companies where organisation_id = $1 and code = 'PAYCHEX'", [PAYCHEX_ORG])).id;
for (const cap of [PLATFORM_FINANCE_CAPABILITIES.view, PLATFORM_FINANCE_CAPABILITIES.create_transaction, PLATFORM_FINANCE_CAPABILITIES.post]) {
  await db.query("insert into public.finance_capability_grants (organisation_id, profile_id, capability) values ($1, $2, $3)", [PAYCHEX_ORG, OFFICER, cap]);
}
await db.query("insert into public.finance_company_access (organisation_id, profile_id, company_id) values ($1, $2, $3)", [PAYCHEX_ORG, OFFICER, COMPANY]);

async function period(year: number, month: number) {
  const last = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return (await one<{ id: string }>(
    "insert into public.finance_periods (organisation_id, company_id, year, month, start_date, end_date, status) values ($1, $2, $3, $4, $5, $6, 'open') returning id",
    [PAYCHEX_ORG, COMPANY, year, month, `${year}-${mm}-01`, `${year}-${mm}-${last}`]
  )).id;
}
const AUG = await period(2026, 8);
const SEP = await period(2026, 9);
const OCT = await period(2026, 10);
const acct = async (code: string) => (await one<{ id: string }>("select id from public.finance_accounts where organisation_id = $1 and code = $2", [PAYCHEX_ORG, code])).id;
const [CASH, AR, AP, EQUITY, REVENUE, SUBCON, OPEX] = await Promise.all(["1060", "1070", "2000", "3000", "4000", "5010", "6150"].map(acct));

let refSeq = 0;
async function post(date: string, periodId: string, source: { type: string | null; id: string | null }, lines: Array<[string, number, number]>, type = "other") {
  refSeq += 1;
  const ft = await one<{ id: string }>(
    `insert into public.finance_transactions (organisation_id, company_id, reference, transaction_date, transaction_type, description, amount, currency, status, source_type, source_id, created_by_profile_id)
     values ($1, $2, $3, $4, $5, $6, $7, 'NGN', 'draft', $8, $9, $10) returning id`,
    [PAYCHEX_ORG, COMPANY, `RPT-${refSeq}`, date, type, `Report fixture ${refSeq}`, lines.reduce((s, l) => s + l[1], 0), source.type, source.id, OFFICER]
  );
  const journal = await one<{ id: string }>("select public.finance_post_transaction($1, $2, $3::jsonb, $4) as id", [
    ft.id,
    OFFICER,
    JSON.stringify(lines.map(([account_id, debit, credit]) => ({ account_id, debit, credit }))),
    periodId,
  ]);
  return { transactionId: ft.id, journalId: journal.id };
}

// August: capital introduced, first invoice. September: invoice, subcontract cost, operating expense.
const capital = await post("2026-08-03", AUG, { type: "manual_journal", id: null }, [[CASH, 1_000_000, 0], [EQUITY, 0, 1_000_000]], "foundation");
const augInvoiceId = randomUUID();
await post("2026-08-20", AUG, { type: "invoice", id: augInvoiceId }, [[AR, 300_000, 0], [REVENUE, 0, 300_000]]);
await post("2026-09-05", SEP, { type: "invoice", id: randomUUID() }, [[AR, 500_000, 0], [REVENUE, 0, 500_000]]);
const billId = randomUUID();
const supplier = await post("2026-09-10", SEP, { type: "vendor_bill", id: billId }, [[SUBCON, 200_000, 0], [AP, 0, 200_000]]);
await post("2026-09-18", SEP, { type: "manual_journal", id: null }, [[OPEX, 45_000, 0], [CASH, 0, 45_000]]);
await db.query("update public.finance_periods set status = 'closed', closed_at = now(), closed_by_profile_id = $1 where id = $2", [OFFICER, AUG]);

// Contamination probes — distinctive amounts that must never appear in any report figure.
const DRAFT_AMOUNT = 777_777.77;
const DRAFT_ENTRY_AMOUNT = 888_888.88;
const HISTORICAL_AMOUNT = 123_456.78;
await db.query(
  `insert into public.finance_transactions (organisation_id, company_id, reference, transaction_date, transaction_type, description, amount, currency, status, source_type, source_id, created_by_profile_id)
   values ($1, $2, 'RPT-DRAFT', '2026-09-25', 'other', 'Unposted draft', $3, 'NGN', 'draft', 'vendor_bill', $4, $5)`,
  [PAYCHEX_ORG, COMPANY, DRAFT_AMOUNT, randomUUID(), OFFICER]
);
let draftEntryPlanted = false;
try {
  const ft = await one<{ id: string }>(
    `insert into public.finance_transactions (organisation_id, company_id, reference, transaction_date, transaction_type, description, amount, currency, status, created_by_profile_id)
     values ($1, $2, 'RPT-DRAFT-ENTRY', '2026-09-26', 'other', 'Draft entry probe', $3, 'NGN', 'draft', $4) returning id`,
    [PAYCHEX_ORG, COMPANY, DRAFT_ENTRY_AMOUNT, OFFICER]
  );
  const entry = await one<{ id: string }>(
    `insert into public.finance_journal_entries (organisation_id, company_id, period_id, transaction_id, entry_date, reference, description, status, posted_by_profile_id)
     values ($1, $2, $3, $4, '2026-09-26', 'RPT-DRAFT-ENTRY', 'Draft entry probe', 'draft', $5) returning id`,
    [PAYCHEX_ORG, COMPANY, SEP, ft.id, OFFICER]
  );
  await db.query("insert into public.finance_journal_lines (journal_entry_id, line_no, account_id, debit, credit) values ($1, 1, $2, $3, 0), ($1, 2, $4, 0, $3)", [entry.id, OPEX, DRAFT_ENTRY_AMOUNT, CASH]);
  draftEntryPlanted = true;
} catch {
  // The schema refused a direct draft entry — the exclusion is then enforced upstream as well.
}
await db.query(
  `insert into public.platform_finance_historical_commercial_facts (organisation_id, code, description, submitted_amount, authorised_amount, amount_received, currency)
   values ($1, 'HCF-RPT-1', 'Historical probe', $2, $2, $2, 'NGN')`,
  [PAYCHEX_ORG, HISTORICAL_AMOUNT]
);

// Project the views EXACTLY as the repositories do (PlatformFinanceRepository.listPostedAccountMovements and
// PlatformFinanceReportsRepository.listPostedLedgerLines).
const periods = (await all<Record<string, unknown>>("select id, year, month, to_char(start_date, 'YYYY-MM-DD') as start_date, to_char(end_date, 'YYYY-MM-DD') as end_date, status from public.finance_periods where company_id = $1", [COMPANY])).map(
  (p) => ({ id: String(p.id), organisationId: PAYCHEX_ORG, companyId: COMPANY, year: Number(p.year), month: Number(p.month), startDate: String(p.start_date), endDate: String(p.end_date), status: p.status as FinancePeriod["status"], closedAt: null, closedByProfileId: null, createdAt: "", updatedAt: "" })
) as FinancePeriod[];
const periodById = new Map(periods.map((p) => [p.id, p]));
const classification = new Map((await all<{ id: string; classification: string | null }>("select id, classification from public.finance_accounts where organisation_id = $1", [PAYCHEX_ORG])).map((a) => [a.id, a.classification]));
const movements: PostedAccountMovement[] = (await all<Record<string, unknown>>(
  "select period_id, account_id, account_code, account_name, account_type, total_debit, total_credit from public.finance_trial_balance_v where organisation_id = $1 and company_id = $2",
  [PAYCHEX_ORG, COMPANY]
)).map((r) => {
  const p = periodById.get(String(r.period_id))!;
  return {
    periodId: p.id, year: p.year, month: p.month, accountId: String(r.account_id), accountCode: String(r.account_code), accountName: String(r.account_name),
    accountType: r.account_type as PostedAccountMovement["accountType"], classification: classification.get(String(r.account_id)) ?? null,
    totalDebit: Number(r.total_debit), totalCredit: Number(r.total_credit),
  };
});
const lines: PostedLedgerLine[] = (await all<Record<string, unknown>>(
  `select journal_line_id, journal_entry_id, transaction_id, period_id, to_char(entry_date, 'YYYY-MM-DD') as entry_date, entry_reference, entry_description, line_description, line_no, account_id, account_code, account_name, account_type, debit, credit, posted_at::text
   from public.finance_general_ledger_v where organisation_id = $1 and company_id = $2 order by journal_line_id`,
  [PAYCHEX_ORG, COMPANY]
)).map((r) => {
  const p = periodById.get(String(r.period_id))!;
  return {
    journalLineId: String(r.journal_line_id), journalEntryId: String(r.journal_entry_id), transactionId: String(r.transaction_id), periodId: p.id, year: p.year, month: p.month,
    entryDate: String(r.entry_date), reference: String(r.entry_reference), entryDescription: String(r.entry_description), lineDescription: (r.line_description as string | null) ?? null,
    lineNo: Number(r.line_no), accountId: String(r.account_id), accountCode: String(r.account_code), accountName: String(r.account_name), accountType: String(r.account_type),
    debit: Number(r.debit), credit: Number(r.credit), postedAt: String(r.posted_at),
  };
});
const sources = new Map<string, JournalSourceRef>(
  (await all<{ id: string; source_type: string | null; source_id: string | null }>("select id, source_type, source_id from public.finance_transactions where organisation_id = $1", [PAYCHEX_ORG])).map((t) => [t.id, { sourceType: t.source_type, sourceId: t.source_id, payableId: null }])
);
const P = (id: string) => periodById.get(id)!;

function everyFigure(value: unknown, out: number[] = []): number[] {
  if (typeof value === "number") out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => everyFigure(v, out));
  else if (value && typeof value === "object") Object.values(value).forEach((v) => everyFigure(v, out));
  return out;
}
const pnl = buildProfitAndLossReport({ companyId: COMPANY, period: P(SEP), scope: "period", comparison: resolveComparativePeriod(periods, P(SEP), "prior_period"), movements });
const bs = buildBalanceSheetReport({ companyId: COMPANY, period: P(SEP), comparison: resolveComparativePeriod(periods, P(SEP), "prior_period"), movements });
const tb = buildTrialBalanceMovementReport({ companyId: COMPANY, period: P(SEP), movements });
const gl = buildGeneralLedgerReport({ from: P(AUG), to: P(SEP), movements, lines });
const journal = buildJournalReport({ from: P(AUG), to: P(OCT), lines, sources });

await check("1 formal statements come only from posted journals: the ledger views contain exactly the posted entries", async () => {
  const posted = await all<{ id: string }>("select id from public.finance_journal_entries where company_id = $1 and status = 'posted'", [COMPANY]);
  assert(posted.length === 5, `five posted entries (got ${posted.length})`);
  assert(new Set(lines.map((l) => l.journalEntryId)).size === 5, "GL view carries exactly the posted entries");
  assert(journal.entries.length === 5 && journal.entries.every((e) => e.balanced), "journal report: every posted entry, each balanced");
  assert(draftEntryPlanted, "the draft journal entry probe was planted (otherwise this check proves nothing)");
  assert(!lines.some((l) => l.reference === "RPT-DRAFT-ENTRY"), "a draft journal entry never reaches the ledger view");
});

await check("2 unposted drafts and Historical Commercial Facts contaminate no statement, ledger or journal report figure", () => {
  const figures = [pnl, bs, tb, gl, journal].flatMap((r) => everyFigure(r));
  for (const probe of [DRAFT_AMOUNT, DRAFT_ENTRY_AMOUNT, HISTORICAL_AMOUNT]) {
    assert(!figures.some((f) => near(f, probe)), `probe ${probe} leaked into a report figure`);
  }
  assert(near(pnl.current.totalRevenue, 500_000) && near(pnl.current.totalDirectCosts, 200_000) && near(pnl.current.totalOperatingExpenses, 45_000), "September P&L = posted September activity only");
  assert(near(pnl.current.netProfit, 255_000), "September net profit");
});

await check("3 report totals reconcile to the authoritative Accounting builders (P&L, Balance Sheet, Trial Balance)", () => {
  const direct = buildProfitAndLoss({ companyId: COMPANY, periodId: SEP, scope: "period", period: { year: 2026, month: 9 }, heading: "", subheading: "", movements });
  assert(JSON.stringify(direct.revenue) === JSON.stringify(pnl.current.revenue) && direct.netProfit === pnl.current.netProfit, "P&L report = Accounting P&L");
  const bsDirect = buildBalanceSheet({ companyId: COMPANY, periodId: SEP, asAtDate: "2026-09-30", asAtLabel: "", asOf: { year: 2026, month: 9 }, movements });
  assert(bsDirect.totalAssets === bs.current.totalAssets && bsDirect.totalEquity === bs.current.totalEquity && bs.balanced, "Balance Sheet report = Accounting Balance Sheet, and balances");
  assert(near(bs.current.totalAssets, 1_000_000 + 800_000 - 45_000), "assets = cash 955k + AR 800k");
  const tbDirect = buildTrialBalance({ companyId: COMPANY, periodId: SEP, asAtDate: "2026-09-30", asAtLabel: "", asOf: { year: 2026, month: 9 }, movements });
  for (const row of tbDirect.rows) {
    const mine = tb.rows.find((r) => r.accountId === row.accountId);
    assert(mine && mine.closingDebit === row.debit && mine.closingCredit === row.credit, `TB closing ${row.accountCode} = Accounting TB`);
  }
  assert(tb.balanced && near(tb.totals.closingDebit, tbDirect.totalDebit), "TB with movements balances in every column and matches the Accounting TB total");
  for (const r of tb.rows) {
    assert(near(r.openingDebit - r.openingCredit + r.periodDebit - r.periodCredit, r.closingDebit - r.closingCredit), `opening + movement = closing for ${r.accountCode}`);
  }
});

await check("4 General Ledger report: opening + posted lines = closing, and each closing equals the Trial Balance as at the last period", () => {
  const sepOnly = buildGeneralLedgerReport({ from: P(SEP), to: P(SEP), movements, lines });
  const cash = sepOnly.accounts.find((a) => a.accountCode === "1060")!;
  assert(near(cash.openingBalance, 1_000_000) && near(cash.closingBalance, 955_000), "cash opening from August, closing after September");
  assert(near(cash.lines.at(-1)!.runningBalance, cash.closingBalance), "running balance ends at closing");
  const tbSep = buildTrialBalance({ companyId: COMPANY, periodId: SEP, asAtDate: "2026-09-30", asAtLabel: "", asOf: { year: 2026, month: 9 }, movements });
  for (const a of gl.accounts) {
    const row = tbSep.rows.find((r) => r.accountId === a.accountId);
    assert(near(a.closingBalance, row ? row.debit - row.credit : 0), `GL closing ${a.accountCode} reconciles to TB`);
  }
  assert(near(gl.totalDebit, lines.reduce((s, l) => s + l.debit, 0)), "GL debits = posted lines in range");
  const filtered = buildGeneralLedgerReport({ from: P(SEP), to: P(SEP), movements, lines, accountId: AR });
  assert(filtered.accounts.length === 1 && near(filtered.accounts[0].openingBalance, 300_000), "account filter keeps its opening balance");
});

await check("5 period semantics: P&L is for a period / YTD, Balance Sheet and TB are as at the period end, closed periods still report", () => {
  const ytd = buildProfitAndLossReport({ companyId: COMPANY, period: P(SEP), scope: "ytd", comparison: resolveComparativePeriod(periods, P(SEP), "none"), movements });
  assert(near(ytd.current.totalRevenue, 800_000), "YTD revenue = August + September");
  const aug = buildBalanceSheetReport({ companyId: COMPANY, period: P(AUG), comparison: resolveComparativePeriod(periods, P(AUG), "none"), movements });
  assert(near(aug.current.totalAssets, 1_300_000) && aug.balanced, "as at 31 August (a closed period) excludes September");
  const oct = buildProfitAndLossReport({ companyId: COMPANY, period: P(OCT), scope: "period", comparison: resolveComparativePeriod(periods, P(OCT), "none"), movements });
  assert(!oct.currentHasActivity, "October: no posted activity is reported as such, not as a result");
});

await check("6 comparison reconciles independently per period; a missing comparative period is unavailable, never zero", () => {
  const augOnly = buildProfitAndLoss({ companyId: COMPANY, periodId: AUG, scope: "period", period: { year: 2026, month: 8 }, heading: "", subheading: "", movements });
  assert(pnl.comparative && pnl.comparative.netProfit === augOnly.netProfit && near(augOnly.totalRevenue, 300_000), "comparative column = independent August build");
  assert(near(pnl.netProfit.variance!, pnl.current.netProfit - augOnly.netProfit), "variance = current − comparative");
  const rev = pnl.sections.find((s) => s.key === "revenue")!;
  assert(near(rev.current, 500_000) && near(rev.comparative!, 300_000), "section totals per column");
  const noPrior = buildProfitAndLossReport({ companyId: COMPANY, period: P(SEP), scope: "period", comparison: resolveComparativePeriod(periods, P(SEP), "prior_year"), movements });
  assert(noPrior.comparative === null && noPrior.comparativeLabel === null && /September 2025/.test(noPrior.comparativeUnavailableReason ?? ""), "no September 2025 period → unavailable with a reason");
  assert(noPrior.sections.every((s) => s.comparative === null && s.lines.every((l) => l.comparative === null)), "unavailable comparative produces null, not zero");
  const augCmp = resolveComparativePeriod(periods, P(AUG), "prior_period");
  assert(augCmp.period === null && /July 2026/.test(augCmp.unavailableReason ?? ""), "prior period of August does not exist");
  assert(bs.comparative && near(bs.totalAssets.comparative!, 1_300_000) && bs.comparativeBalanced === true, "Balance Sheet comparative = independent as-at-August build");
});

await check("7 drill-through and provenance: journal source by source_type, GL lines link their journal entry, figures drill to the GL range", () => {
  const supplierEntry = journal.entries.find((e) => e.journalEntryId === supplier.journalId)!;
  assert(supplierEntry.sourceLabel === "Supplier bill" && supplierEntry.sourceHref === `/platform-finance/vendor-bills/${billId}`, "vendor bill provenance");
  const capitalEntry = journal.entries.find((e) => e.journalEntryId === capital.journalId)!;
  assert(capitalEntry.sourceLabel === "Manual journal" && capitalEntry.sourceHref === null, "manual journal has no fabricated link");
  assert(gl.accounts.every((a) => a.lines.every((l) => lines.some((x) => x.journalLineId === l.journalLineId && x.journalEntryId === l.journalEntryId))), "every GL report line is a real posted line of its entry");
  assert(journal.bySource.reduce((s, x) => s + x.count, 0) === journal.entries.length, "source breakdown covers every entry");
  const drill = ledgerDrillRange(periods, P(SEP), "ytd");
  assert(drill.from.id === AUG && drill.to.id === SEP, "YTD drill covers the year's periods up to the statement period");
  assert(ledgerDrillRange(periods, P(SEP), "period").from.id === SEP, "period drill = the period");
  const href = ledgerDrillHref({ companyId: COMPANY, accountId: REVENUE, periods, period: P(SEP), basis: "cumulative" });
  assert(href.startsWith("/platform-finance/reports/general-ledger?") && href.includes(`account=${REVENUE}`) && href.includes(`from=${AUG}`), "cumulative drill reaches back to the first period");
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Part 2 — operational reports use their own domains
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

const C1 = "company-1";
const C2 = "company-2";
const receivable = (p: Partial<FinanceReceivable>): FinanceReceivable => ({
  id: randomUUID(), organisationId: "o", companyId: C1, companyName: "C1", originType: "invoice", offLedger: false, invoiceId: randomUUID(), counterpartyId: "cp",
  invoiceReference: "INV-1", invoiceDate: "2026-08-01", dueDate: "2026-09-01", clientReference: null, submittedOn: null, description: null, sourceLocation: null, sourceUpdate: null,
  historicalFactCode: null, currency: "NGN", originalAmount: 100, outstandingAmount: 100, availableToAllocate: 100, counterpartyDisplayName: "Client A", counterpartyLegalName: null,
  counterpartyTaxRegistrationId: null, financeTransactionId: null, journalEntryId: null, createdAt: "2026-08-01T00:00:00Z", status: "open", ...p,
});

await check("8 receivables ageing: company-scoped, ledger-recognised vs off-ledger kept apart, per-currency totals, missing due date never inferred", () => {
  const r = buildReceivablesAgeing({
    asAt: "2026-09-30",
    companyId: C1,
    receivables: [
      receivable({ dueDate: "2026-09-20", outstandingAmount: 100 }),
      receivable({ dueDate: "2026-06-01", outstandingAmount: 50 }),
      receivable({ originType: "client_request", offLedger: true, invoiceId: null, dueDate: null, outstandingAmount: 70, currency: "USD" }),
      receivable({ outstandingAmount: 0, status: "settled" }),
      receivable({ companyId: C2, outstandingAmount: 999 }),
    ],
  });
  assert(r.rows.length === 3 && r.settledExcluded === 1, "open rows only; other company excluded");
  assert(r.rows.find((x) => x.outstanding === 70)!.bucket === "no_due_date", "no due date bucket");
  assert(r.ledgerRecognisedTotals.length === 1 && near(r.ledgerRecognisedTotals[0].amount, 150) && r.offLedgerTotals[0].currency === "USD", "ledger split, currencies never summed together");
  assert(r.totals.length === 2, "one total per currency");
  assert(ageingBucket("2026-09-30", "2026-09-30") === "not_due" && ageingBucket("2026-08-31", "2026-09-30") === "d1_30" && ageingBucket("2026-06-01", "2026-09-30") === "d90_plus", "bucket edges");
});

await check("9 payables outstanding: only approved obligations that still owe; awaiting approval shown apart", () => {
  const payable = (p: Partial<FinancePayableView>): FinancePayableView => ({
    id: randomUUID(), organisationId: "o", companyId: C1, createdByProfileId: "p", status: "approved", currency: "NGN", payableAmount: 100, paidAmount: 0, payeeName: "Supplier",
    payeeType: "vendor", paymentDestination: null, description: null, dueDate: "2026-09-01", sourceType: "vendor_bill", sourceId: "b", projectContractRef: null, periodId: null,
    createdAt: "", updatedAt: "", outstandingAmount: 100, ...p,
  } as FinancePayableView);
  const r = buildPayablesOutstanding({
    asAt: "2026-09-30",
    companyId: C1,
    payables: [
      payable({}),
      payable({ status: "partially_paid", paidAmount: 40, outstandingAmount: 60, sourceType: "financial_request" as FinancePayableView["sourceType"] }),
      payable({ status: "paid", paidAmount: 100, outstandingAmount: 0 }),
      payable({ status: "draft" }),
      payable({ status: "rejected" }),
      payable({ status: "pending_approval", payableAmount: 500 }),
      payable({ companyId: C2 }),
    ],
  });
  assert(r.rows.length === 2 && near(r.totals[0].amount, 160), "approved + partially paid only");
  assert(r.awaitingApproval.count === 1 && near(r.awaitingApproval.totals[0].amount, 500), "pending approval separated, not owed");
  assert(r.bySource.find((s) => s.source === "Financial Request")!.count === 1, "source split");
});

await check("10 collections, supplier payments, pipelines and completeness: correct domain, date basis and status rules", () => {
  const receipt = (p: Partial<FinanceReceipt>): FinanceReceipt => ({
    id: randomUUID(), organisationId: "o", companyId: C1, counterpartyId: "c", destinationFinancialAccountId: "fa", reference: "RCPT-1", externalReference: null, receiptDate: "2026-09-10",
    currency: "NGN", amount: 10, status: "confirmed", counterpartyDisplayName: "Client", destinationAccountName: "Bank", destinationAccountLast4: "1234", financeTransactionId: null,
    journalEntryId: null, allocations: [], createdAt: "", confirmedAt: null, postedAt: null, ...p,
  });
  const col = buildCollectionsReport({ companyId: C1, from: "2026-09-01", to: "2026-09-30", receipts: [receipt({}), receipt({ status: "posted", amount: 5, receiptDate: "2026-09-30" }), receipt({ status: "draft" }), receipt({ receiptDate: "2026-10-01" }), receipt({ companyId: C2 })] });
  assert(col.rows.length === 2 && col.draftsExcluded === 1 && near(col.postedTotals[0].amount, 5) && near(col.awaitingPostingTotals[0].amount, 10), "confirmed/posted in range; drafts excluded; inclusive end date");
  const work = (p: Partial<PaymentAccountingWorkItem>): PaymentAccountingWorkItem => ({
    paymentId: randomUUID(), payableId: "pay", companyId: C1, payeeName: "S", amount: 20, currency: "NGN", paymentDate: "2026-09-15", accountingStatus: "pending", blockingReason: null,
    transactionId: null, journalEntryId: null, treatment: "accrued_settlement", payableSourceType: "vendor_bill", payableSourceId: "b", sourceControlAccountId: null, ...p,
  });
  const pay = buildSupplierPaymentsReport({ companyId: C1, from: "2026-09-01", to: "2026-09-30", payments: [work({}), work({ accountingStatus: "posted", journalEntryId: "j" }), work({ paymentDate: "2026-08-31" })] });
  assert(pay.rows.length === 2 && near(pay.awaitingTotals[0].amount, 20) && near(pay.postedTotals[0].amount, 20), "payments by payment date with accounting status");
  const bill = (p: Partial<FinanceVendorBill>): FinanceVendorBill => ({
    id: randomUUID(), organisationId: "o", companyId: C1, inputterProfileId: "i", status: "under_review", currency: "NGN", billedAmount: 100, approvedAmount: 0, payeeName: "Vendor",
    payeeType: "vendor", paymentDestination: null, invoiceReference: "V-1", invoiceDate: null, description: null, purpose: "x", goodsServicesReceived: true, dueDate: null,
    projectContractRef: null, financeNotes: null, ceoDecisionNotes: null, queriedAt: null, submittedAt: "2026-09-02T10:00:00Z", reviewedAt: null, decidedAt: null, createdAt: "", updatedAt: "", ...p,
  } as FinanceVendorBill);
  const vb = buildVendorBillPipeline({ companyId: C1, from: "2026-09-01", to: "2026-09-30", bills: [bill({}), bill({ status: "approved", approvedAmount: 90 }), bill({ status: "draft", submittedAt: null }), bill({ status: "rejected", approvedAmount: 55 })] });
  assert(vb.rows.length === 3 && vb.draftsExcluded === 1, "submitted bills only");
  assert(near(vb.statuses.find((s) => s.status === "approved")!.amounts[1].totals[0].amount, 90) && near(vb.statuses.find((s) => s.status === "rejected")!.amounts[1].totals[0].amount, 0), "approved amount counted only once decided");
  const req = (p: Partial<FinancialRequest>): FinancialRequest => ({
    id: randomUUID(), organisationId: "o", companyId: C1, requesterProfileId: "r", status: "approved", currency: "NGN", requestedAmount: 50, approvedAmount: 40, paidAmount: 10, categoryId: "c",
    purpose: "x", description: null, payeeName: "P", payeeType: "staff", paymentDestination: null, requiredByDate: null, externalReference: null, projectContractRef: null, financeNotes: null,
    ceoDecisionNotes: null, queriedAt: null, submittedAt: "2026-09-03T00:00:00Z", reviewedAt: null, decidedAt: null, createdAt: "", updatedAt: "", ...p,
  } as FinancialRequest);
  const fr = buildFinancialRequestPipeline({ companyId: C1, from: "2026-09-01", to: "2026-09-30", requests: [req({}), req({ companyId: C2 })] });
  assert(fr.rows.length === 1 && fr.amountLabels.join() === "Requested,Approved,Paid", "requests pipeline");
  const item = (p: Partial<AccountingReviewWorkItem>): AccountingReviewWorkItem => ({
    sourceType: "vendor_bill", sourceId: "b", sourceLabel: "Supplier bill", sourceHref: "/x", counterparty: "V", reference: null, accountingDate: "2026-09-01", amount: 10, currency: "NGN", companyId: C1,
    proposedDebit: { side: "debit", account: null, determinedBy: "reviewer" }, proposedCredit: { side: "credit", account: null, determinedBy: "system" }, status: "pending", blockingReason: null,
    transactionId: null, journalEntryId: null, ...p,
  });
  const comp = buildAccountingCompleteness({ companyId: C1, work: [item({}), item({ status: "posted" }), item({ sourceType: "payment", status: "draft", blockingReason: "No period" }), item({ companyId: C2 })] });
  assert(comp.rows.length === 2 && comp.blockedCount === 1 && comp.groups.every((g) => g.count === 1), "posted excluded, blocked flagged, company-scoped");
});

// ════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Part 3 — permissions, source authority and export truthfulness (static)
// ════════════════════════════════════════════════════════════════════════════════════════════════════════════

await check("11 report access reuses existing Finance capabilities and company access — no new capability, no bypass", () => {
  const known = new Set<string>(Object.values(PLATFORM_FINANCE_CAPABILITIES));
  for (const r of [...FINANCE_REPORTS, FINANCE_HISTORICAL_ENTRY]) {
    assert(r.capabilities.length > 0 && r.capabilities.every((c) => known.has(c)), `${r.id}: only existing capabilities`);
  }
  for (const r of FINANCE_REPORTS.filter((x) => x.family === "statement" || x.id === "general-ledger" || x.id === "journal")) {
    assert(r.capabilities.length === 1 && r.capabilities[0] === PLATFORM_FINANCE_CAPABILITIES.view, `${r.id}: accounting view exactly, as the Accounting views`);
  }
  assert(FINANCE_REPORTS.find((r) => r.id === "receivables-ageing")!.capabilities.join() === PLATFORM_FINANCE_CAPABILITIES.receivable_view, "receivables: the receivables grant only");
  assert(FINANCE_REPORTS.find((r) => r.id === "collections")!.capabilities.join() === PLATFORM_FINANCE_CAPABILITIES.receipt_view, "collections: the receipts view grant only");
  const fr = FINANCE_REPORTS.find((r) => r.id === "financial-request-pipeline")!.capabilities as readonly string[];
  assert(!fr.includes("platform_finance.request.create") && !fr.includes("platform_finance.request.view_own"), "requests pipeline is oversight-only (no requester grants)");
  assert(!canOpenFinanceReport(FINANCE_REPORTS[0], new Set(["platform_finance.receivable.view"])), "a receivables grant does not open the statements");
  const route = src("src/app/api/platform-finance/reports/route.ts");
  assert(/requirePlatformFinanceAccessAny\(\{ capabilities: report\.capabilities, companyId: params\.companyId \}\)/.test(route), "route gates each run by that report's capabilities AND company access");
  assert(/getCatalogue[\s\S]*requirePlatformFinanceWorkspaceAccess\(\)/.test(route), "catalogue needs a Finance workspace grant");
  const service = src("src/modules/platform-finance/server/PlatformFinanceReportsServerService.ts");
  assert(/await this\.requireReport\(actor, report\);\s*const company = await this\.requireCompany\(actor, params\.companyId\);/.test(service), "service re-verifies grant then company before reading");
  assert(/listAccessibleCompanyIds\(actor\.profileId\)[\s\S]*FORBIDDEN/.test(service), "company access is finance_company_access, Super Admin not exempt");
});

await check("12 source authority: statements/ledger read posted views only; operational reports go through their domain services; historical facts are never read", () => {
  const repo = src("src/modules/platform-finance/server/PlatformFinanceReportsRepository.ts").replace(/\/\*[\s\S]*?\*\//g, "");
  assert(repo.includes('.from("finance_general_ledger_v")') && !/finance_journal_lines|finance_journal_entries/.test(repo), "ledger lines only from the posted GL view");
  const view = src("supabase/migrations/20260914140000_finance_foundation.sql");
  assert(/create or replace view public\.finance_general_ledger_v[\s\S]*?where e\.status = 'posted';/.test(view), "GL view is posted-only");
  const service = src("src/modules/platform-finance/server/PlatformFinanceReportsServerService.ts");
  for (const [report, call] of [
    ["receivables-ageing", "PlatformFinanceReceivablesServerService(this.organisationId).list(actor)"],
    ["payables-outstanding", "PlatformFinancePayablesServerService(this.organisationId).listAccessiblePayables(actor)"],
    ["collections", "PlatformFinanceReceiptsServerService(this.organisationId).list(actor)"],
    ["supplier-payments", "PlatformFinancePaymentAccountingServerService(this.organisationId).listWork(actor)"],
    ["vendor-bill-pipeline", "PlatformFinanceVendorBillsServerService(this.organisationId).listAccessibleVendorBills(actor)"],
    ["financial-request-pipeline", "PlatformFinanceRequestsServerService(this.organisationId).listAccessibleRequests(actor)"],
    ["accounting-completeness", "PlatformFinanceAccountingReviewServerService(this.organisationId).listWork(actor)"],
  ] as const) {
    assert(service.includes(call), `${report} reads through ${call.split("(")[0]}`);
  }
  const reportFiles = [
    "src/modules/platform-finance/reports/statements.ts",
    "src/modules/platform-finance/reports/ledger.ts",
    "src/modules/platform-finance/reports/operational.ts",
    "src/modules/platform-finance/server/PlatformFinanceReportsServerService.ts",
    "src/modules/platform-finance/server/PlatformFinanceReportsRepository.ts",
  ].map(src).join("\n");
  assert(!/historical_commercial_facts|HistoricalFacts(Server|Repository)/.test(reportFiles), "no report reads Historical Commercial Facts");
  const statements = src("src/modules/platform-finance/reports/statements.ts") + src("src/modules/platform-finance/reports/ledger.ts");
  assert(!/invoices|vendorBills|requests|receipts|payables/.test(statements.replace(/\/\*[\s\S]*?\*\//g, "")), "statements/ledger import no operational domain");
  assert(!/\.(insert|update|upsert|delete|rpc)\(/.test(service + repo), "reports write nothing");
});

await check("13 honesty: Cash Flow stays unavailable with a reason; Reports is live; exports carry disclosures and neutralise formulas", () => {
  const nav = src("src/modules/platform-finance/nav.ts");
  assert(nav.includes('href: "/platform-finance/reports",\n    label: "Reports"'), "Reports navigable");
  assert(/href: null,\s*label: "Cash Flow"/.test(nav) && !existsSync("src/app/(app)/platform-finance/accounting/cash-flow/page.tsx"), "Cash Flow still not built");
  assert(FINANCE_UNAVAILABLE_REPORTS.some((r) => r.id === "cash-flow" && /operating, investing or financing/.test(r.reason)), "Cash Flow explains why");
  const run: FinanceReportRun = { reportId: "profit-and-loss", family: "statement", title: "Profit & Loss", companyId: COMPANY, companyName: "PayChex", basisLabel: "For September 2026", source: "Posted journals", generatedAt: "2026-09-30T10:00:00Z", disclosures: ["Posted only."], payload: { kind: "profit-and-loss", report: pnl } };
  const csv = financeReportCsv(run);
  assert(csv.includes("Disclosure,Posted only.") && csv.includes("For September 2026") && csv.includes("255000.00"), "CSV carries basis, disclosures and figures");
  assert(csvEscape("=HYPERLINK(1)") === "'=HYPERLINK(1)" && csvEscape(-5) === "-5.00" && csvEscape('a,"b"') === '"a,""b"""', "CSV escaping");
  const noCmp = financeReportCsv({ ...run, payload: { kind: "profit-and-loss", report: buildProfitAndLossReport({ companyId: COMPANY, period: P(SEP), scope: "period", comparison: resolveComparativePeriod(periods, P(SEP), "prior_year"), movements }) } });
  assert(!noCmp.includes("Variance"), "no comparative column is exported when the comparative is unavailable");
});

console.log(failures ? `\n${failures} check(s) failed` : "\nAll Reports checks passed");
process.exit(failures ? 1 : 0);
