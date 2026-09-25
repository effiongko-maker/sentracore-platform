import type { FinanceCompany, FinancePeriod } from "@/modules/platform-finance/types";
import type {
  FinanceReportCatalogueEntry,
  FinanceReportParams,
  FinanceReportRun,
} from "@/modules/platform-finance/reports/types";

const API_PATH = "/api/platform-finance/reports";

export class FinanceReportApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function post<T>(body: Record<string, unknown>): Promise<T> {
  const response = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    credentials: "same-origin",
  });
  const json = (await response.json().catch(() => null)) as
    | { success: true; data: T }
    | { success: false; message?: string }
    | null;
  if (!response.ok || !json || !json.success) {
    throw new FinanceReportApiError(
      (json && "message" in json && json.message) || "Report request failed.",
      response.status
    );
  }
  return json.data;
}

export const PlatformFinanceReportsService = {
  getCatalogue(): Promise<{ entries: FinanceReportCatalogueEntry[]; companies: FinanceCompany[] }> {
    return post({ action: "getCatalogue" });
  },
  listPeriods(companyId: string): Promise<FinancePeriod[]> {
    return post({ action: "listPeriods", input: { companyId } });
  },
  runReport(reportId: string, params: FinanceReportParams): Promise<FinanceReportRun> {
    return post({ action: "runReport", reportId, input: params });
  },
};
