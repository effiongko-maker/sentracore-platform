import { FacilityService } from "@/services/facilities/FacilityService";
import { ReportingService } from "@/services/reporting/ReportingService";
import {
  DocumentBuilderService,
  type DocumentGenerationRequest,
} from "@/services/reporting/documents";
import {
  defaultMonth,
  defaultQuarter,
  defaultYear,
  REPORT_LIBRARY,
} from "@/modules/reports/constants";
import { buildPeriodFromParams } from "@/modules/reports/utils";
import type {
  GeneratedReportRecord,
  ReportGenerationParams,
  ReportsHomeSnapshot,
} from "@/modules/reports/types";

/** In-memory report history for the current browser session. */
const generatedReports: GeneratedReportRecord[] = [];

async function loadFacilityOptions(): Promise<
  Array<{ id: string; name: string }>
> {
  try {
    const result = await FacilityService.listFacilities({
      page: 1,
      pageSize: 200,
      status: "all",
    });
    return result.data
      .filter((f) => f.id && f.name)
      .map((f) => ({ id: f.id, name: f.name }));
  } catch {
    // Home must still render when Apps Script is unreachable.
    return [];
  }
}

/**
 * Reports application service — orchestrates generation only.
 * Home/library does not require ReportingService.
 * Generation still consumes ReportingSnapshot via DocumentBuilderService.
 */
export const ReportsService = {
  async getHome(): Promise<ReportsHomeSnapshot> {
    const facilityOptions = await loadFacilityOptions();
    return {
      asOf: new Date().toISOString(),
      library: REPORT_LIBRARY,
      generated: [...generatedReports],
      facilityOptions,
    };
  },

  async getFacilityOptions(): Promise<Array<{ id: string; name: string }>> {
    return loadFacilityOptions();
  },

  listGenerated(): GeneratedReportRecord[] {
    return [...generatedReports];
  },

  getGenerated(id: string): GeneratedReportRecord | undefined {
    return generatedReports.find((row) => row.id === id);
  },

  async generate(
    params: ReportGenerationParams
  ): Promise<GeneratedReportRecord> {
    const facilityId =
      params.facilityId && params.facilityId !== "all"
        ? params.facilityId
        : undefined;

    const snapshot = await ReportingService.getReportingSnapshot({
      facilityId,
    });

    const request: DocumentGenerationRequest = {
      kind: params.kind,
      format: params.format,
      facilityId: params.facilityId,
      department: params.department,
      period: buildPeriodFromParams(params),
      branding: {
        clientName: params.clientName,
        templateVersion: params.templateVersion,
        logoUrl: params.logoUrl,
        language: params.language,
      },
      generatedBy: "SentraCore",
      templateVersion: params.templateVersion,
    };

    try {
      const { document, exportResult } = await DocumentBuilderService.generate(
        snapshot,
        request
      );

      const record: GeneratedReportRecord = {
        id: `rpt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        title: document.title,
        kind: document.kind,
        generatedBy: document.context.generatedBy ?? "SentraCore",
        generatedAt: document.context.generatedAt,
        facilityName: document.context.facilityName ?? "Portfolio",
        periodLabel: document.context.period.label,
        format: params.format,
        status: exportResult.status === "ready" ? "ready" : "failed",
        filename: exportResult.filename,
        mimeType: exportResult.mimeType,
        content: exportResult.content,
        message: exportResult.message,
      };

      generatedReports.unshift(record);
      return record;
    } catch (err) {
      const failed: GeneratedReportRecord = {
        id: `rpt_${Date.now()}_fail`,
        title: REPORT_LIBRARY.find((r) => r.kind === params.kind)?.title ??
          params.kind,
        kind: params.kind,
        generatedBy: "SentraCore",
        generatedAt: new Date().toISOString(),
        facilityName: facilityId ?? "Portfolio",
        periodLabel: buildPeriodFromParams(params).label,
        format: params.format,
        status: "failed",
        filename: "",
        mimeType: "",
        content: "",
        message:
          err instanceof Error ? err.message : "Report generation failed.",
      };
      generatedReports.unshift(failed);
      return failed;
    }
  },

  defaultParams(
    kind: ReportGenerationParams["kind"] = "monthly_facility"
  ): ReportGenerationParams {
    return {
      kind,
      format: "pdf",
      facilityId: "all",
      periodKind:
        kind === "annual"
          ? "year"
          : kind === "quarterly"
            ? "quarter"
            : "month",
      month: defaultMonth(),
      quarter: defaultQuarter(),
      year: defaultYear(),
      templateVersion: "v1",
      language: "en",
    };
  },
};

export type IReportsService = typeof ReportsService;
