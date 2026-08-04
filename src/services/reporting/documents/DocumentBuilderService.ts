import type { ReportingSnapshot } from "@/services/reporting/types";
import { buildAnnualReportDocument } from "./builders/AnnualReportBuilder";
import { buildAssetReportDocument } from "./builders/AssetReportBuilder";
import { buildExecutiveSummaryDocument } from "./builders/ExecutiveSummaryBuilder";
import { buildIncidentReportDocument } from "./builders/IncidentReportBuilder";
import { buildMaintenanceReportDocument } from "./builders/MaintenanceReportBuilder";
import { buildMonthlyFacilityReportDocument } from "./builders/MonthlyReportBuilder";
import { buildQuarterlyReportDocument } from "./builders/QuarterlyReportBuilder";
import { facilityLabel, periodLabel } from "./builders/shared";
import { buildWorkOrderReportDocument } from "./builders/WorkOrderReportBuilder";
import { exportTemplatedDocument } from "./exporters";
import { TemplateAdapter } from "./templates/TemplateAdapter";
import type {
  DocumentBuildContext,
  DocumentGenerationRequest,
  DocumentKind,
  ExportResult,
  ReportDocumentModel,
  TemplatedDocument,
} from "./types";

const builders: Record<
  DocumentKind,
  (snapshot: ReportingSnapshot, context: DocumentBuildContext) => ReportDocumentModel
> = {
  executive_summary: buildExecutiveSummaryDocument,
  monthly_facility: buildMonthlyFacilityReportDocument,
  quarterly: buildQuarterlyReportDocument,
  annual: buildAnnualReportDocument,
  maintenance: buildMaintenanceReportDocument,
  work_order: buildWorkOrderReportDocument,
  incident: buildIncidentReportDocument,
  asset: buildAssetReportDocument,
};

function resolveContext(
  snapshot: ReportingSnapshot,
  request: DocumentGenerationRequest
): DocumentBuildContext {
  const facilityId =
    request.facilityId && request.facilityId !== "all"
      ? request.facilityId
      : snapshot.facilityId;

  const period = {
    ...request.period,
    label: periodLabel(request.period),
  };

  return {
    period,
    facilityId,
    facilityName: facilityLabel(snapshot, facilityId),
    department: request.department,
    branding: {
      ...request.branding,
      templateVersion:
        request.templateVersion ?? request.branding?.templateVersion ?? "v1",
    },
    generatedBy: request.generatedBy ?? "SentraCore",
    generatedAt: new Date().toISOString(),
  };
}

/**
 * Document composition layer.
 * Consumes ReportingSnapshot only — never computes KPIs or calls Domain Services.
 */
export const DocumentBuilderService = {
  build(
    snapshot: ReportingSnapshot,
    request: DocumentGenerationRequest
  ): ReportDocumentModel {
    const context = resolveContext(snapshot, request);
    return builders[request.kind](snapshot, context);
  },

  adapt(
    document: ReportDocumentModel,
    request?: Pick<
      DocumentGenerationRequest,
      "templateId" | "templateVersion"
    >
  ): TemplatedDocument {
    return TemplateAdapter.apply(document, {
      templateId: request?.templateId,
      templateVersion: request?.templateVersion,
    });
  },

  async export(
    templated: TemplatedDocument,
    format: DocumentGenerationRequest["format"]
  ): Promise<ExportResult> {
    return exportTemplatedDocument(templated, format);
  },

  /**
   * Full pipeline: Snapshot → Builder → TemplateAdapter → Exporter
   */
  async generate(
    snapshot: ReportingSnapshot,
    request: DocumentGenerationRequest
  ): Promise<{
    document: ReportDocumentModel;
    templated: TemplatedDocument;
    exportResult: ExportResult;
  }> {
    const document = this.build(snapshot, request);
    const templated = this.adapt(document, request);
    const exportResult = await this.export(templated, request.format);
    return { document, templated, exportResult };
  },

  listKinds(): DocumentKind[] {
    return Object.keys(builders) as DocumentKind[];
  },
};

export type IDocumentBuilderService = typeof DocumentBuilderService;
