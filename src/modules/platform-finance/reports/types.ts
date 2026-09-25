import type { FinanceReportFamily, FinanceReportId } from "@/modules/platform-finance/reports/catalogue";
import type { BalanceSheetReport, ProfitAndLossReport, TrialBalanceMovementReport } from "@/modules/platform-finance/reports/statements";
import type { GeneralLedgerReport, JournalReport } from "@/modules/platform-finance/reports/ledger";
import type {
  AccountingCompletenessReport,
  CollectionsReport,
  PayablesOutstandingReport,
  PipelineReport,
  ReceivablesAgeingReport,
  SupplierPaymentsReport,
} from "@/modules/platform-finance/reports/operational";

/** Parameters a report run accepts; each report reads only the ones its catalogue parameter kind declares. */
export type FinanceReportParams = {
  companyId: string;
  periodId?: string | null;
  fromPeriodId?: string | null;
  toPeriodId?: string | null;
  scope?: "period" | "ytd" | null;
  comparison?: "none" | "prior_period" | "prior_year" | null;
  accountId?: string | null;
  from?: string | null;
  to?: string | null;
};

export type FinanceReportPayload =
  | { kind: "profit-and-loss"; report: ProfitAndLossReport }
  | { kind: "balance-sheet"; report: BalanceSheetReport }
  | { kind: "trial-balance"; report: TrialBalanceMovementReport }
  | { kind: "general-ledger"; report: GeneralLedgerReport }
  | { kind: "journal"; report: JournalReport }
  | { kind: "accounting-completeness"; report: AccountingCompletenessReport }
  | { kind: "receivables-ageing"; report: ReceivablesAgeingReport }
  | { kind: "payables-outstanding"; report: PayablesOutstandingReport }
  | { kind: "collections"; report: CollectionsReport }
  | { kind: "supplier-payments"; report: SupplierPaymentsReport }
  | { kind: "vendor-bill-pipeline"; report: PipelineReport }
  | { kind: "financial-request-pipeline"; report: PipelineReport };

export type FinanceReportRun = {
  reportId: FinanceReportId;
  family: FinanceReportFamily;
  title: string;
  companyId: string;
  companyName: string;
  /** e.g. "For September 2026", "As at 30 September 2026", "1 Sep 2026 – 30 Sep 2026". */
  basisLabel: string;
  source: string;
  generatedAt: string;
  /** Truth statements that must travel with the report (print, PDF and CSV included). */
  disclosures: string[];
  payload: FinanceReportPayload;
};

export type FinanceReportCatalogueEntry = {
  id: string;
  family: FinanceReportFamily;
  title: string;
  summary: string;
  basis: string;
  source: string;
  href: string | null;
  /** available: can be opened; restricted: exists but the viewer lacks the governing grant; unavailable: not built. */
  availability: "available" | "restricted" | "unavailable";
  note: string | null;
};
