/**
 * Document generation types.
 * Independent of Dashboard. Consumes ReportingSnapshot only at builder boundary.
 */

export type DocumentKind =
  | "executive_summary"
  | "monthly_facility"
  | "quarterly"
  | "annual"
  | "maintenance"
  | "work_order"
  | "incident"
  | "asset";

export type DocumentOutputFormat = "word" | "pdf" | "excel";

export type ReportingPeriodKind = "month" | "quarter" | "year" | "custom";

export interface DocumentPeriod {
  kind: ReportingPeriodKind;
  /** ISO date YYYY-MM-DD or YYYY-MM */
  start?: string;
  end?: string;
  /** Calendar month 1–12 */
  month?: number;
  /** Calendar year */
  year?: number;
  /** Quarter 1–4 */
  quarter?: number;
  label: string;
}

export interface DocumentBranding {
  clientName?: string;
  templateVersion?: string;
  logoUrl?: string;
  language?: string;
}

export interface DocumentBuildContext {
  period: DocumentPeriod;
  facilityId?: string;
  facilityName?: string;
  department?: string;
  branding?: DocumentBranding;
  generatedBy?: string;
  generatedAt: string;
}

export interface CoverLetterContent {
  subject: string;
  salutation: string;
  body: string;
  closing: string;
  signatory?: string;
}

export interface DocumentSection {
  id: string;
  title: string;
  /** Prose paragraphs for narrative sections */
  paragraphs?: string[];
  /** Key/value metrics for dashboards */
  metrics?: Array<{ key: string; label: string; value: string | number }>;
  /** Bullet lists */
  bullets?: string[];
  /** Tabular rows for Excel / appendix */
  rows?: Array<Record<string, string | number>>;
}

/** Base shape shared by every generated document model. */
export interface BaseDocumentModel {
  kind: DocumentKind;
  title: string;
  subtitle?: string;
  context: DocumentBuildContext;
  /** Future Word merge / cover letter support */
  coverLetter?: CoverLetterContent;
  sections: DocumentSection[];
  /**
   * Flat field bag intended for template placeholders.
   * Keys are camelCase matching {{placeholder}} names.
   */
  fields: Record<string, string | number>;
}

export interface ExecutiveSummaryDocument extends BaseDocumentModel {
  kind: "executive_summary";
}

export interface MonthlyFacilityReportDocument extends BaseDocumentModel {
  kind: "monthly_facility";
}

export interface QuarterlyReportDocument extends BaseDocumentModel {
  kind: "quarterly";
}

export interface AnnualStatusReportDocument extends BaseDocumentModel {
  kind: "annual";
}

export interface MaintenanceReportDocument extends BaseDocumentModel {
  kind: "maintenance";
}

export interface WorkOrderReportDocument extends BaseDocumentModel {
  kind: "work_order";
}

export interface IncidentReportDocument extends BaseDocumentModel {
  kind: "incident";
}

export interface AssetReportDocument extends BaseDocumentModel {
  kind: "asset";
}

export type ReportDocumentModel =
  | ExecutiveSummaryDocument
  | MonthlyFacilityReportDocument
  | QuarterlyReportDocument
  | AnnualStatusReportDocument
  | MaintenanceReportDocument
  | WorkOrderReportDocument
  | IncidentReportDocument
  | AssetReportDocument;

export type DocumentBuilderFn = (
  // ReportingSnapshot imported only at call sites to keep types file free of cycles
  snapshot: import("@/services/reporting/types").ReportingSnapshot,
  context: DocumentBuildContext
) => ReportDocumentModel;

/** Placeholder map produced by TemplateAdapter — string values only. */
export type TemplatePlaceholderMap = Record<string, string>;

export interface TemplatedDocument {
  kind: DocumentKind;
  title: string;
  templateId: string;
  templateVersion: string;
  placeholders: TemplatePlaceholderMap;
  /** Fully substituted template body (text representation until binary merge). */
  renderedBody: string;
  document: ReportDocumentModel;
}

export interface ExportResult {
  status: "ready" | "not_implemented";
  format: DocumentOutputFormat;
  filename: string;
  mimeType: string;
  /** UTF-8 text or base64 for binary future work */
  content: string;
  encoding: "utf-8" | "base64";
  message?: string;
}

export interface DocumentGenerationRequest {
  kind: DocumentKind;
  format: DocumentOutputFormat;
  facilityId?: string | "all";
  department?: string;
  period: DocumentPeriod;
  branding?: DocumentBranding;
  generatedBy?: string;
  /** Optional explicit template id / version for future multi-template support */
  templateId?: string;
  templateVersion?: string;
}
