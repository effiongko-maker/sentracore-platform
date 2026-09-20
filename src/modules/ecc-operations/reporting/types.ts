export type EccReportTypeId =
  | "daily"
  | "weekly"
  | "monthly"
  | "management"
  | "activity"
  | "incident"
  | "custom";

export type EccReportSectionId =
  | "executive_summary"
  | "key_metrics"
  | "daily_operations"
  | "centre_performance"
  | "call_activity"
  | "issues"
  | "requests"
  | "recommendations"
  | "appendix";

/** Mirrors FM Reporting wizard steps; centre replaces multi-facility scope. */
export type EccReportWizardStep =
  | "type"
  | "centre"
  | "period"
  | "sections"
  | "generate";

export type EccReportOutputFormat = "Word";

export type EccReportTypeDefinition = {
  id: EccReportTypeId;
  title: string;
  description: string;
  includes: string[];
  audience: string[];
  outputs: EccReportOutputFormat[];
  /** Suggested period window in days (exclusive of custom date pickers). */
  defaultPeriodDays: number;
  defaultSections: EccReportSectionId[];
  /** When true, start with no sections selected so the user builds content. */
  emptySectionsByDefault?: boolean;
};

export type EccReportWizardState = {
  step: EccReportWizardStep;
  reportType: EccReportTypeId | null;
  title: string;
  rangeFrom: string;
  rangeTo: string;
  preparedBy: string;
  sections: EccReportSectionId[];
  sectionsBaseline: EccReportSectionId[];
};

export type EccReportSectionDefinition = {
  id: EccReportSectionId;
  title: string;
  description: string;
};

export type EccReportConfig = {
  reportType: EccReportTypeId;
  title: string;
  rangeFrom: string;
  rangeTo: string;
  preparedBy: string;
  sections: EccReportSectionId[];
  sectionsBaseline: EccReportSectionId[];
};

export type EccReportMetric = {
  id: string;
  label: string;
  value: string;
  detail?: string;
};

export type EccReportTable = {
  headers: string[];
  rows: Array<{ id: string; cells: string[] }>;
  emptyMessage?: string;
};

export type EccClientReportDocument = {
  id: string;
  reportType: EccReportTypeId;
  title: string;
  subtitle: string;
  generatedAt: string;
  periodLabel: string;
  centreName: string;
  facilityLabel: string;
  asOf: string;
  sections: EccReportSectionId[];
  cover: {
    preparedFor: string;
    preparedBy: string;
    confidentiality: string;
  };
  /** RECORDED FACTS only — counts and statuses read from the ECC registers. */
  executiveSummary: {
    overview: string;
    highlights: string[];
    /** Recorded attention facts (open/escalated/high-urgent counts). */
    risks: string[];
  };
  /**
   * INFERRED ANALYSIS — derived by SentraCore™ Intelligence from the same
   * records. Always presented under an explicit "not recorded fact" label,
   * identically in preview and Word.
   */
  analysis: {
    label: string;
    summary: string;
    highlights: string[];
    attention: string[];
  };
  /** Label shown above the recommendations (they are suggestions, not recorded actions). */
  recommendationsNote: string;
  keyMetrics: EccReportMetric[];
  dailyOperations: {
    narrative: string;
    table: EccReportTable;
  };
  centrePerformance: {
    narrative: string;
    table: EccReportTable;
  };
  callActivity: {
    narrative: string;
    table: EccReportTable;
  };
  issues: {
    narrative: string;
    metrics: EccReportMetric[];
    table: EccReportTable;
  };
  requests: {
    narrative: string;
    metrics: EccReportMetric[];
    table: EccReportTable;
  };
  recommendations: string[];
  appendix: {
    dataNotes: string[];
    registers: Array<{ title: string; table: EccReportTable }>;
  };
};
