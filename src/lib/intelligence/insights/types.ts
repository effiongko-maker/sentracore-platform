/**
 * First-class Intelligence Insight — reasoning product object.
 * Optional fields stay unset when existing data cannot support them.
 */

export type InsightConfidence = "High" | "Moderate" | "Emerging";

export type InsightReasoningType =
  | "pattern"
  | "recurrence"
  | "concentration"
  | "trend"
  | "correlation"
  | "anomaly"
  | "risk"
  | "treatment_effectiveness"
  | "capacity"
  | "predictive"
  | "recommendation"
  | "positive";

export type InsightOutcomeStatus =
  | "detected"
  | "interpreted"
  | "recommended"
  | "action_taken"
  | "resolved"
  | "confirmed"
  | "persisting"
  | "unknown";

export type InsightEvidenceItem = {
  label: string;
  value: string;
  /** Source plane for traceability — never invent. */
  source:
    | "operational_events"
    | "action_runs"
    | "recommendation_decisions"
    | "organisation_intelligence";
};

export type InsightRelatedEntity = {
  kind: "facility" | "asset" | "incident" | "maintenance" | "work_order" | "event" | "finding";
  id: string;
  label?: string;
};

export type InsightSuggestedAction = {
  kind: "observe" | "monitor" | "investigate" | "act" | "escalate";
  label: string;
  href?: string;
};

/**
 * Insight = meaningful conclusion grounded in operational evidence.
 * FACT / INFERENCE / RECOMMENDATION must remain distinguishable.
 */
export type IntelligenceInsight = {
  id: string;
  reasoningType: InsightReasoningType;
  title: string;
  /** Plain-language headline for “what we noticed”. */
  observation: string;
  /**
   * FACT — what SentraCore directly knows from operational records / events.
   * Must not contain interpretive language.
   */
  fact: string;
  /**
   * INFERENCE — what the reasoning layer concludes.
   * Must use tentative language (may / suggests / appears).
   */
  inference: string;
  /** Why this matters for the operation (optional if unsupported). */
  impact?: string;
  /**
   * RECOMMENDATION — only when evidence supports a specific course of action.
   * Omit rather than inventing generic advice.
   */
  recommendation?: string;
  confidence: InsightConfidence;
  /** Human-readable basis for confidence when available. */
  confidenceBasis?: string;
  evidence: InsightEvidenceItem[];
  relatedEntities: InsightRelatedEntity[];
  suggestedActions: InsightSuggestedAction[];
  outcome?: {
    status: InsightOutcomeStatus;
    summary?: string;
  };
  /** Provenance for reuse of briefing/change/pattern/story ids. */
  sourceRefs: {
    priorityId?: string;
    patternId?: string;
    changeId?: string;
    storyId?: string;
  };
};

export type OrganisationInsightBundle = {
  asOf: string;
  windowDays: number;
  insights: IntelligenceInsight[];
  /** Pass-through status from OrganisationIntelligence. */
  status: {
    state: string;
    supported: boolean;
    notes: string[];
    partial: boolean;
    processing: boolean;
  };
  recommendationHealth: {
    totalDecisions: number;
    accepted: number;
    dismissed: number;
    deferred: number;
  };
  /** Preserve exploration capability without making them primary IA. */
  exploration: {
    changeCount: number;
    patternCount: number;
  };
};
