import type {
  DocumentKind,
  DocumentOutputFormat,
  DocumentPeriod,
} from "@/services/reporting/documents";

export type { DocumentKind, DocumentOutputFormat, DocumentPeriod };

export type ReportLibraryIcon =
  | "executive"
  | "monthly"
  | "quarterly"
  | "annual"
  | "maintenance"
  | "work_order"
  | "incident"
  | "asset";

export interface ReportLibraryItem {
  kind: DocumentKind;
  title: string;
  description: string;
  /** Short purpose bullets shown on the card */
  highlights: string[];
  /** Modules included in the document */
  modules: string[];
  /** Recommended audience */
  audience: string[];
  /** Supported output formats */
  outputs: DocumentOutputFormat[];
  icon: ReportLibraryIcon;
  available: boolean;
}

export type GeneratedReportStatus = "ready" | "failed";

export interface GeneratedReportRecord {
  id: string;
  title: string;
  kind: DocumentKind;
  generatedBy: string;
  generatedAt: string;
  facilityName: string;
  periodLabel: string;
  format: DocumentOutputFormat;
  status: GeneratedReportStatus;
  filename: string;
  mimeType: string;
  content: string;
  message?: string;
}

export interface ReportGenerationParams {
  kind: DocumentKind;
  format: DocumentOutputFormat;
  facilityId: string | "all";
  department?: string;
  periodKind: DocumentPeriod["kind"];
  month?: number;
  quarter?: number;
  year: number;
  /** Future-ready branding fields */
  clientName?: string;
  templateVersion?: string;
  logoUrl?: string;
  language?: string;
}

export interface ReportsHomeSnapshot {
  asOf: string;
  library: ReportLibraryItem[];
  generated: GeneratedReportRecord[];
  facilityOptions: Array<{ id: string; name: string }>;
}
