import "server-only";
import { ActionError } from "@/lib/actions/errors";
import { createAdminClient } from "@/utils/supabase/admin";
import { PlatformFinanceRepository } from "@/modules/platform-finance/server/PlatformFinanceRepository";
import { PlatformFinanceReportsRepository } from "@/modules/platform-finance/server/PlatformFinanceReportsRepository";
import { PlatformFinanceAccountingReviewServerService } from "@/modules/platform-finance/server/PlatformFinanceAccountingReviewServerService";
import { PlatformFinancePaymentAccountingServerService } from "@/modules/platform-finance/server/PlatformFinancePaymentAccountingServerService";
import { PlatformFinanceReceivablesServerService } from "@/modules/platform-finance/server/PlatformFinanceReceivablesServerService";
import { PlatformFinancePayablesServerService } from "@/modules/platform-finance/server/PlatformFinancePayablesServerService";
import { PlatformFinanceReceiptsServerService } from "@/modules/platform-finance/server/PlatformFinanceReceiptsServerService";
import { PlatformFinanceVendorBillsServerService } from "@/modules/platform-finance/server/PlatformFinanceVendorBillsServerService";
import { PlatformFinanceRequestsServerService } from "@/modules/platform-finance/server/PlatformFinanceRequestsServerService";
import { OPENING_BALANCE_DISCLOSURE } from "@/modules/platform-finance/domain/accountingReadModels";
import { financePeriodLabel, periodOrdinal } from "@/modules/platform-finance/domain/periods";
import type { FinanceCompany, FinancePeriod } from "@/modules/platform-finance/types";
import {
  FINANCE_HISTORICAL_ENTRY,
  FINANCE_REPORTS,
  FINANCE_UNAVAILABLE_REPORTS,
  canOpenFinanceReport,
  financeReportById,
  financeReportHref,
  type FinanceReportDefinition,
} from "@/modules/platform-finance/reports/catalogue";
import {
  buildBalanceSheetReport,
  buildProfitAndLossReport,
  buildTrialBalanceMovementReport,
  parseComparisonMode,
  resolveComparativePeriod,
} from "@/modules/platform-finance/reports/statements";
import { buildGeneralLedgerReport, buildJournalReport, periodRangeLabel } from "@/modules/platform-finance/reports/ledger";
import {
  buildAccountingCompleteness,
  buildCollectionsReport,
  buildFinancialRequestPipeline,
  buildPayablesOutstanding,
  buildReceivablesAgeing,
  buildSupplierPaymentsReport,
  buildVendorBillPipeline,
  isIsoDate,
} from "@/modules/platform-finance/reports/operational";
import type {
  FinanceReportCatalogueEntry,
  FinanceReportParams,
  FinanceReportPayload,
  FinanceReportRun,
} from "@/modules/platform-finance/reports/types";

type Actor = { organisationId: string; profileId: string };

export const LEDGER_ONLY_DISCLOSURE =
  "Prepared only from journals posted in SentraCore™. Draft or unposted accounting, operational records and Historical Commercial Facts are not included.";
export const OPERATIONAL_DISCLOSURE =
  "Management report from operational Finance records. These are not general-ledger figures and may differ from the accounting statements.";

function formatDay(iso: string): string {
  const date = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(date.getTime())
    ? iso
    : date.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

/**
 * Reports composition. Accounting reports read posted movements / posted journal lines through the same builders as
 * the Accounting views; operational reports read each domain through that domain's own server service, so the
 * domain's existing read rules still apply. This service writes nothing.
 */
export class PlatformFinanceReportsServerService {
  private readonly repo: PlatformFinanceRepository;
  private readonly reportsRepo: PlatformFinanceReportsRepository;

  constructor(private readonly organisationId: string) {
    this.repo = new PlatformFinanceRepository(organisationId);
    this.reportsRepo = new PlatformFinanceReportsRepository(organisationId);
  }

  private async grantedCapabilities(profileId: string): Promise<Set<string>> {
    const { data, error } = await createAdminClient()
      .from("finance_capability_grants")
      .select("capability")
      .eq("organisation_id", this.organisationId)
      .eq("profile_id", profileId);
    if (error) throw new ActionError("INTERNAL_ERROR", "Unable to verify finance capabilities.");
    return new Set((data ?? []).map((row) => String(row.capability)));
  }

  async listAccessibleCompanies(actor: Actor): Promise<FinanceCompany[]> {
    const [companies, ids] = await Promise.all([
      this.repo.listCompanies(),
      this.repo.listAccessibleCompanyIds(actor.profileId),
    ]);
    const allowed = new Set(ids);
    return companies.filter((c) => allowed.has(c.id) && c.status === "active");
  }

  async getCatalogue(actor: Actor): Promise<{ entries: FinanceReportCatalogueEntry[]; companies: FinanceCompany[] }> {
    const granted = await this.grantedCapabilities(actor.profileId);
    const entries: FinanceReportCatalogueEntry[] = [
      ...FINANCE_REPORTS.map((report) => {
        const open = canOpenFinanceReport(report, granted);
        return {
          id: report.id,
          family: report.family,
          title: report.title,
          summary: report.summary,
          basis: report.basis,
          source: report.source,
          href: open ? financeReportHref(report.id) : null,
          availability: open ? ("available" as const) : ("restricted" as const),
          note: open ? null : "Requires an existing Finance grant for this area.",
        };
      }),
      ...FINANCE_UNAVAILABLE_REPORTS.map((report) => ({
        id: report.id,
        family: report.family,
        title: report.title,
        summary: report.summary,
        basis: "—",
        source: "—",
        href: null,
        availability: "unavailable" as const,
        note: report.reason,
      })),
      (() => {
        const open = canOpenFinanceReport(FINANCE_HISTORICAL_ENTRY, granted);
        return {
          id: FINANCE_HISTORICAL_ENTRY.id,
          family: FINANCE_HISTORICAL_ENTRY.family,
          title: FINANCE_HISTORICAL_ENTRY.title,
          summary: FINANCE_HISTORICAL_ENTRY.summary,
          basis: FINANCE_HISTORICAL_ENTRY.basis,
          source: "Historical Commercial Facts register",
          href: open ? FINANCE_HISTORICAL_ENTRY.href : null,
          availability: open ? ("available" as const) : ("restricted" as const),
          note: open ? null : "Requires the historical facts view grant.",
        };
      })(),
    ];
    return { entries, companies: await this.listAccessibleCompanies(actor) };
  }

  async listPeriods(actor: Actor, companyId: string): Promise<FinancePeriod[]> {
    await this.requireCompany(actor, companyId);
    return (await this.repo.listPeriods(companyId)).sort(
      (a, b) => periodOrdinal(b.year, b.month) - periodOrdinal(a.year, a.month)
    );
  }

  private async requireCompany(actor: Actor, companyId: string): Promise<FinanceCompany> {
    if (!companyId) throw new ActionError("VALIDATION_ERROR", "Company is required.");
    const ids = await this.repo.listAccessibleCompanyIds(actor.profileId);
    if (!ids.includes(companyId)) throw new ActionError("FORBIDDEN", "You do not have access to this finance company.");
    const company = await this.repo.getCompany(companyId);
    if (!company || company.organisationId !== this.organisationId) {
      throw new ActionError("FORBIDDEN", "Finance company not in your organisation.");
    }
    return company;
  }

  private async requireReport(actor: Actor, report: FinanceReportDefinition): Promise<void> {
    if (actor.organisationId !== this.organisationId) throw new ActionError("FORBIDDEN", "Organisation mismatch.");
    const granted = await this.grantedCapabilities(actor.profileId);
    if (!canOpenFinanceReport(report, granted)) {
      throw new ActionError("FORBIDDEN", `Missing capability ${report.capabilities.join(" | ")}.`);
    }
  }

  private periodOf(periods: readonly FinancePeriod[], id: string | null | undefined, label: string): FinancePeriod {
    const period = id ? periods.find((p) => p.id === id) : null;
    if (!period) throw new ActionError("VALIDATION_ERROR", `${label} is required and must belong to this company.`);
    return period;
  }

  private dateRange(params: FinanceReportParams): { from: string; to: string } {
    const from = params.from ?? "";
    const to = params.to ?? "";
    if (!isIsoDate(from) || !isIsoDate(to)) throw new ActionError("VALIDATION_ERROR", "Date from and date to must be YYYY-MM-DD.");
    if (from > to) throw new ActionError("VALIDATION_ERROR", "Date from must be on or before date to.");
    return { from, to };
  }

  async run(actor: Actor, reportId: string, params: FinanceReportParams): Promise<FinanceReportRun> {
    const report = financeReportById(reportId);
    if (!report) throw new ActionError("VALIDATION_ERROR", "Unknown report.");
    await this.requireReport(actor, report);
    const company = await this.requireCompany(actor, params.companyId);
    const companyId = company.id;
    const generatedAt = new Date().toISOString();
    const today = generatedAt.slice(0, 10);
    const base = { reportId: report.id, family: report.family, title: report.title, companyId, companyName: company.name, source: report.source, generatedAt };
    const done = (basisLabel: string, disclosures: string[], payload: FinanceReportPayload): FinanceReportRun => ({ ...base, basisLabel, disclosures, payload });

    if (report.family === "statement" || report.id === "general-ledger" || report.id === "journal") {
      const periods = await this.repo.listPeriods(companyId);
      const movements = await this.repo.listPostedAccountMovements(companyId);
      const ledgerDisclosures = [LEDGER_ONLY_DISCLOSURE, OPENING_BALANCE_DISCLOSURE];
      switch (report.id) {
        case "profit-and-loss": {
          const period = this.periodOf(periods, params.periodId, "Period");
          const scope = params.scope === "ytd" ? "ytd" : "period";
          const comparison = resolveComparativePeriod(periods, period, parseComparisonMode(params.comparison));
          const built = buildProfitAndLossReport({ companyId, period, scope, comparison, movements });
          return done(scope === "ytd" ? `Year to ${financePeriodLabel(period.year, period.month)}` : `For ${financePeriodLabel(period.year, period.month)}`, ledgerDisclosures, { kind: "profit-and-loss", report: built });
        }
        case "balance-sheet": {
          const period = this.periodOf(periods, params.periodId, "Period");
          const comparison = resolveComparativePeriod(periods, period, parseComparisonMode(params.comparison));
          const built = buildBalanceSheetReport({ companyId, period, comparison, movements });
          return done(built.currentLabel, ledgerDisclosures, { kind: "balance-sheet", report: built });
        }
        case "trial-balance": {
          const period = this.periodOf(periods, params.periodId, "Period");
          const built = buildTrialBalanceMovementReport({ companyId, period, movements });
          return done(`Movement for ${built.periodLabel} · ${built.asAtLabel}`, ledgerDisclosures, { kind: "trial-balance", report: built });
        }
        case "general-ledger":
        case "journal": {
          const from = this.periodOf(periods, params.fromPeriodId, "From period");
          const to = this.periodOf(periods, params.toPeriodId, "To period");
          if (periodOrdinal(from.year, from.month) > periodOrdinal(to.year, to.month)) {
            throw new ActionError("VALIDATION_ERROR", "From period must be on or before to period.");
          }
          const inRange = periods.filter(
            (p) => periodOrdinal(p.year, p.month) >= periodOrdinal(from.year, from.month) && periodOrdinal(p.year, p.month) <= periodOrdinal(to.year, to.month)
          );
          const lines = await this.reportsRepo.listPostedLedgerLines(companyId, inRange);
          const basis = periodRangeLabel(from, to);
          if (report.id === "general-ledger") {
            const accountId = params.accountId?.trim() || null;
            if (accountId && !(await this.repo.getAccount(accountId))) throw new ActionError("VALIDATION_ERROR", "GL account not found.");
            const built = buildGeneralLedgerReport({ from, to, movements, lines, accountId });
            return done(basis, ledgerDisclosures, { kind: "general-ledger", report: built });
          }
          const sources = await this.reportsRepo.listTransactionSources(lines.map((l) => l.transactionId));
          const built = buildJournalReport({ from, to, lines, sources });
          return done(basis, [LEDGER_ONLY_DISCLOSURE], { kind: "journal", report: built });
        }
      }
    }

    switch (report.id) {
      case "accounting-completeness": {
        const work = await new PlatformFinanceAccountingReviewServerService(this.organisationId).listWork(actor);
        return done(`As at ${formatDay(today)}`, [
          "Source records whose accounting is not yet posted. Until posted they are absent from every financial statement.",
        ], { kind: "accounting-completeness", report: buildAccountingCompleteness({ work, companyId }) });
      }
      case "receivables-ageing": {
        const receivables = await new PlatformFinanceReceivablesServerService(this.organisationId).list(actor);
        return done(`As at ${formatDay(today)}`, [
          OPERATIONAL_DISCLOSURE,
          "Invoice receivables are recognised in Trade Accounts Receivable once posted and are settled by posted receipts. Off-ledger client billing has no ledger recognition and is settled by confirmed receipts.",
          "Current position only: historical as-at ageing is not available because receivable positions are not snapshotted.",
        ], { kind: "receivables-ageing", report: buildReceivablesAgeing({ receivables, companyId, asAt: today }) });
      }
      case "payables-outstanding": {
        const payables = await new PlatformFinancePayablesServerService(this.organisationId).listAccessiblePayables(actor);
        return done(`As at ${formatDay(today)}`, [
          OPERATIONAL_DISCLOSURE,
          "Only approved obligations are included. Obligations awaiting approval are shown separately and are not yet owed.",
          "Current position only: historical as-at positions are not available because payable positions are not snapshotted.",
        ], { kind: "payables-outstanding", report: buildPayablesOutstanding({ payables, companyId, asAt: today }) });
      }
      case "collections": {
        const range = this.dateRange(params);
        const receipts = await new PlatformFinanceReceiptsServerService(this.organisationId).list(actor);
        return done(`${formatDay(range.from)} – ${formatDay(range.to)}`, [
          OPERATIONAL_DISCLOSURE,
          "Confirmed and posted receipts by receipt date. Draft receipts are excluded.",
        ], { kind: "collections", report: buildCollectionsReport({ receipts, companyId, ...range }) });
      }
      case "supplier-payments": {
        const range = this.dateRange(params);
        const payments = await new PlatformFinancePaymentAccountingServerService(this.organisationId).listWork(actor);
        return done(`${formatDay(range.from)} – ${formatDay(range.to)}`, [
          OPERATIONAL_DISCLOSURE,
          "Confirmed payments by payment date. Accounting status shows whether each payment has reached the ledger.",
        ], { kind: "supplier-payments", report: buildSupplierPaymentsReport({ payments, companyId, ...range }) });
      }
      case "vendor-bill-pipeline": {
        const range = this.dateRange(params);
        const bills = await new PlatformFinanceVendorBillsServerService(this.organisationId).listAccessibleVendorBills(actor);
        return done(`Submitted ${formatDay(range.from)} – ${formatDay(range.to)}`, [
          OPERATIONAL_DISCLOSURE,
          "Workflow status is not accounting status: an approved bill is recognised in the ledger only once its accounting is posted.",
        ], { kind: "vendor-bill-pipeline", report: buildVendorBillPipeline({ bills, companyId, ...range }) });
      }
      case "financial-request-pipeline": {
        const range = this.dateRange(params);
        const requests = await new PlatformFinanceRequestsServerService(this.organisationId).listAccessibleRequests(actor);
        return done(`Submitted ${formatDay(range.from)} – ${formatDay(range.to)}`, [
          OPERATIONAL_DISCLOSURE,
          "Workflow status is not accounting status. Paid amounts reflect confirmed payments.",
        ], { kind: "financial-request-pipeline", report: buildFinancialRequestPipeline({ requests, companyId, ...range }) });
      }
    }
    throw new ActionError("VALIDATION_ERROR", "Unknown report.");
  }
}
