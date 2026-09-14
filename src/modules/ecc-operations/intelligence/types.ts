export type EccIntelligenceSeverity = "info" | "watch" | "attention";

export type EccIntelligenceInsightKind =
  | "summary"
  | "change"
  | "attention"
  | "pattern"
  | "recommendation"
  | "insufficient_data";

/**
 * A single intelligence item. `observation` is grounded in register data.
 * `interpretation` is optional and must be treated as a suggested reading, not fact.
 */
export type EccIntelligenceInsight = {
  id: string;
  kind: EccIntelligenceInsightKind;
  title: string;
  observation: string;
  interpretation?: string;
  severity: EccIntelligenceSeverity;
  evidence: string[];
  href?: string;
};

export type EccIntelligenceComparison = {
  id: string;
  label: string;
  current: number;
  previous: number | null;
  /** Percent change when previous is a positive number; otherwise null. */
  deltaPct: number | null;
  /** When set, comparison is not reliable enough to treat as a trend. */
  insufficientData?: boolean;
  note?: string;
};

export type EccIntelligenceSnapshot = {
  centreId: string;
  centreName: string;
  asOf: string;
  rangeFrom: string;
  rangeTo: string;
  previousRangeFrom: string;
  previousRangeTo: string;
  periodLabel: string;
  previousPeriodLabel: string;
  /** Concise natural-language summary supported by the selected period data. */
  summary: string;
  keyInsights: EccIntelligenceInsight[];
  attention: EccIntelligenceInsight[];
  trends: EccIntelligenceInsight[];
  managementInsights: EccIntelligenceInsight[];
  recommendations: EccIntelligenceInsight[];
  comparisons: EccIntelligenceComparison[];
  dataNotes: string[];
};
