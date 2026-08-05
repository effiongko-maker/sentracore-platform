export type ReportTypeId =
  | "monthly_operations"
  | "weekly_operations"
  | "quarterly_review"
  | "incident_report"
  | "maintenance_report"
  | "executive_summary";

export type ReportSectionId =
  | "executive_summary"
  | "kpi_summary"
  | "operational_performance"
  | "work_orders"
  | "maintenance"
  | "incidents"
  | "assets"
  | "recommendations"
  | "appendix";

export type ReportPeriodKind = "week" | "month" | "quarter" | "year";

export type ReportWizardStep =
  | "type"
  | "facilities"
  | "period"
  | "sections"
  | "generate";

export type ReportOutputFormat = "Word" | "PDF" | "Excel";

export interface ReportTypeDefinition {
  id: ReportTypeId;
  title: string;
  description: string;
  /** Client-facing package contents shown on selection cards */
  includes: string[];
  audience: string[];
  outputs: ReportOutputFormat[];
  defaultPeriodKind: ReportPeriodKind;
  defaultSections: ReportSectionId[];
}

export interface ReportSectionDefinition {
  id: ReportSectionId;
  title: string;
  description: string;
}

export interface ReportPeriodSelection {
  kind: ReportPeriodKind;
  year: number;
  month?: number;
  quarter?: number;
  /** ISO date for week ending (Sunday) when kind is week */
  weekEnding?: string;
  label: string;
}

export interface ReportWizardState {
  step: ReportWizardStep;
  reportType: ReportTypeId | null;
  facilityIds: string[];
  /** true when user selected all facilities / portfolio */
  allFacilities: boolean;
  period: ReportPeriodSelection;
  sections: ReportSectionId[];
}

export interface ReportKpiMetric {
  id: string;
  label: string;
  value: string;
  detail?: string;
}

export interface ReportChartBar {
  label: string;
  value: number;
  max: number;
  tone?: "neutral" | "success" | "warning" | "danger";
}

export interface ReportTableRow {
  id: string;
  cells: string[];
}

export interface ReportTable {
  headers: string[];
  rows: ReportTableRow[];
  emptyMessage?: string;
}

export interface ClientReportDocument {
  id: string;
  reportType: ReportTypeId;
  title: string;
  subtitle: string;
  generatedAt: string;
  generatedBy: string;
  periodLabel: string;
  facilityLabel: string;
  facilityNames: string[];
  asOf: string;
  healthBand: "healthy" | "watch" | "critical";
  healthScore: number;
  sections: ReportSectionId[];
  cover: {
    preparedFor: string;
    preparedBy: string;
    confidentiality: string;
  };
  executiveSummary: {
    overview: string;
    highlights: string[];
    risks: string[];
  };
  kpiSummary: ReportKpiMetric[];
  operationalPerformance: {
    narrative: string;
    bars: ReportChartBar[];
  };
  workOrders: {
    narrative: string;
    metrics: ReportKpiMetric[];
    table: ReportTable;
  };
  maintenance: {
    narrative: string;
    metrics: ReportKpiMetric[];
    table: ReportTable;
  };
  incidents: {
    narrative: string;
    metrics: ReportKpiMetric[];
    table: ReportTable;
  };
  assets: {
    narrative: string;
    metrics: ReportKpiMetric[];
    table: ReportTable;
  };
  recommendations: string[];
  appendix: {
    dataNotes: string[];
    registers: Array<{ title: string; table: ReportTable }>;
  };
}

export interface ReportsHomeSnapshot {
  asOf: string;
  reportTypes: ReportTypeDefinition[];
  facilityOptions: Array<{ id: string; name: string }>;
}
