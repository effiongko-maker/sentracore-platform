/**
 * Platform Finance → Reports — READ-ONLY live smoke of the real report projections.
 *
 *   NODE_PATH=<dir containing an empty server-only/ stub> \
 *     npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-reports-live-read.mts
 *
 * SOURCE (linked database views/tables) → REPORT PROJECTION (PlatformFinanceReportsServerService) → reconciled against
 * the AUTHORITATIVE Accounting service (getProfitAndLoss / getBalanceSheet / getTrialBalance). Runs as an existing
 * profile that already holds platform_finance.view and company access. Reads only; prints counts, never figures,
 * names or references.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    if (!(k in process.env)) process.env[k] = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
  }
}
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const near = (a: number, b: number) => Math.abs(a - b) < 0.005;

async function main() {
  loadEnvLocal();
  const { createAdminClient } = await import("../src/utils/supabase/admin");
  const { PlatformFinanceReportsServerService } = await import("../src/modules/platform-finance/server/PlatformFinanceReportsServerService");
  const { PlatformFinanceServerService } = await import("../src/modules/platform-finance/server/PlatformFinanceServerService");
  const { selectDefaultFinancePeriod, periodOrdinal } = await import("../src/modules/platform-finance/domain/periods");
  const admin = createAdminClient();

  const { data: org, error: orgError } = await admin.from("organisations").select("id").eq("slug", "paychex").single();
  assert(!orgError && org, "organisation not readable");
  const organisationId = String(org.id);

  const { data: grants } = await admin.from("finance_capability_grants").select("profile_id").eq("organisation_id", organisationId).eq("capability", "platform_finance.view");
  const { data: access } = await admin.from("finance_company_access").select("profile_id").eq("organisation_id", organisationId);
  const withAccess = new Set((access ?? []).map((a) => String(a.profile_id)));
  const profileId = (grants ?? []).map((g) => String(g.profile_id)).find((id) => withAccess.has(id));
  assert(profileId, "no profile holds platform_finance.view with company access");
  const actor = { organisationId, profileId };

  const reports = new PlatformFinanceReportsServerService(organisationId);
  const accounting = new PlatformFinanceServerService(organisationId);
  const catalogue = await reports.getCatalogue(actor);
  assert(catalogue.entries.some((e) => e.id === "cash-flow" && e.availability === "unavailable"), "Cash Flow unavailable");
  const available = catalogue.entries.filter((e) => e.availability === "available" && e.href?.startsWith("/platform-finance/reports/"));
  console.log(`catalogue: ${catalogue.entries.length} entries, ${available.length} runnable for this actor, ${catalogue.companies.length} companies`);

  const today = new Date().toISOString().slice(0, 10);
  const yearAgo = `${Number(today.slice(0, 4)) - 1}${today.slice(4)}`;
  for (const company of catalogue.companies) {
    const periods = await reports.listPeriods(actor, company.id);
    const period = selectDefaultFinancePeriod(periods);
    console.log(`company ${company.code}: ${periods.length} periods${period ? "" : " (no default period)"}`);
    const { PlatformFinanceRepository } = await import("../src/modules/platform-finance/server/PlatformFinanceRepository");
    const movements = await new PlatformFinanceRepository(organisationId).listPostedAccountMovements(company.id);
    const { count: viewRows } = await admin.from("finance_trial_balance_v").select("account_id", { count: "exact", head: true }).eq("organisation_id", organisationId).eq("company_id", company.id);
    assert(movements.length === (viewRows ?? 0) && new Set(movements.map((m) => `${m.periodId}|${m.accountId}`)).size === movements.length, "posted movements: every view row exactly once");
    for (const entry of available) {
      const id = entry.id;
      const isPeriodReport = ["profit-and-loss", "balance-sheet", "trial-balance", "general-ledger", "journal"].includes(id);
      if (isPeriodReport && !period) continue;
      const firstOfYear = period ? periods.filter((p) => p.year === period.year && p.month <= period.month).reduce((m, p) => (p.month < m.month ? p : m), period) : null;
      const run = await reports.run(actor, id, {
        companyId: company.id,
        periodId: period?.id,
        fromPeriodId: firstOfYear?.id,
        toPeriodId: period?.id,
        comparison: "prior_period",
        from: yearAgo,
        to: today,
      });
      assert(run.companyId === company.id && run.disclosures.length > 0 && run.generatedAt, `${id}: envelope`);
      const p = run.payload;
      if (p.kind === "profit-and-loss") {
        const auth = await accounting.getProfitAndLoss(profileId, { companyId: company.id, periodId: period!.id, scope: "period" });
        assert(near(p.report.current.netProfit, auth.netProfit) && near(p.report.current.totalRevenue, auth.totalRevenue), "P&L reconciles to Accounting P&L");
        if (p.report.comparative) {
          const prior = periods.find((x) => periodOrdinal(x.year, x.month) === periodOrdinal(period!.year, period!.month) - 1)!;
          const authPrior = await accounting.getProfitAndLoss(profileId, { companyId: company.id, periodId: prior.id, scope: "period" });
          assert(near(p.report.comparative.netProfit, authPrior.netProfit), "comparative reconciles to the Accounting P&L of the prior period");
        } else assert(p.report.comparativeUnavailableReason, "missing comparative explains itself");
      }
      if (p.kind === "balance-sheet") {
        const auth = await accounting.getBalanceSheet(profileId, { companyId: company.id, periodId: period!.id });
        assert(near(p.report.current.totalAssets, auth.totalAssets) && near(p.report.current.totalLiabilitiesAndEquity, auth.totalLiabilitiesAndEquity), "BS reconciles to Accounting BS");
      }
      if (p.kind === "trial-balance") {
        const auth = await accounting.getTrialBalance(profileId, { companyId: company.id, periodId: period!.id });
        assert(near(p.report.totals.closingDebit, auth.totalDebit) && near(p.report.totals.closingCredit, auth.totalCredit), "TB closing reconciles to Accounting TB");
        for (const row of auth.rows) {
          const mine = p.report.rows.find((r) => r.accountId === row.accountId);
          assert(mine && near(mine.closingDebit, row.debit) && near(mine.closingCredit, row.credit), "TB row reconciles");
        }
      }
      if (p.kind === "general-ledger") {
        const auth = await accounting.getTrialBalance(profileId, { companyId: company.id, periodId: period!.id });
        for (const a of p.report.accounts) {
          const row = auth.rows.find((r) => r.accountId === a.accountId);
          assert(near(a.closingBalance, row ? row.debit - row.credit : 0), "GL closing reconciles to TB");
        }
        const periodIds = periods.filter((x) => periodOrdinal(x.year, x.month) >= periodOrdinal(firstOfYear!.year, firstOfYear!.month) && periodOrdinal(x.year, x.month) <= periodOrdinal(period!.year, period!.month)).map((x) => x.id);
        const { count } = await admin.from("finance_general_ledger_v").select("journal_line_id", { count: "exact", head: true }).eq("company_id", company.id).in("period_id", periodIds);
        assert(p.report.lineCount === (count ?? 0), "GL line count = posted GL view lines in range");
      }
      if (p.kind === "journal") {
        const ids = p.report.entries.map((e) => e.journalEntryId);
        assert(p.report.entries.every((e) => e.balanced), "every reported entry balances");
        if (ids.length) {
          const { data: entries } = await admin.from("finance_journal_entries").select("id, status").in("id", ids.slice(0, 200));
          assert((entries ?? []).every((e) => e.status === "posted"), "only posted entries are reported");
        }
      }
      console.log(`  ${id}: ok`);
    }
  }
  console.log("Reports live read-only smoke passed");
}

main().catch((error) => {
  console.error(`FAIL ${(error as Error).message}`);
  process.exit(1);
});
