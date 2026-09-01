import type { ActionOutcomeStatus, ActionSignal, RecommendationPriority } from "@/lib/events/consumers/outcome";
import type { RecommendationDecisionValue } from "@/lib/recommendations/decisions";

export type IntelligenceStatusState =
  | "ready"
  | "partial"
  | "processing"
  | "unavailable";

export type ConsumerRunState =
  | "succeeded"
  | "partial"
  | "failed"
  | "missing"
  | "unsupported";

export type IntelligenceEventSummary = {
  id: string;
  eventType: string;
  entityType: string | null;
  entityId: string | null;
  organisationId: string;
  departmentId: string | null;
  moduleId: string;
  actorProfileId: string | null;
  occurredAt: string;
  createdAt: string;
  data: Record<string, unknown>;
  source: string;
};

export type IntelligenceSignalView = {
  key: string;
  severity: string;
  summary: string;
  evidence: Record<string, unknown>;
  sourceActionRunId: string;
};

export type IntelligenceRiskView = {
  riskScore: number | null;
  riskLevel: string | null;
  summary: string | null;
  outcomeStatus: ActionOutcomeStatus | null;
  factors: unknown[];
  assessment: Record<string, unknown> | null;
  recommendations: unknown[];
  sourceActionRunId: string | null;
};

export type IntelligenceRecommendationView = {
  id: string;
  title: string;
  description?: string;
  suggestedAction?: string;
  reason: string;
  priority?: RecommendationPriority;
  evidence: unknown[];
  sources: unknown[];
};

export type IntelligenceDecisionRecordView = {
  decisionId: string;
  decision: RecommendationDecisionValue;
  reason: string | null;
  actorProfileId: string;
  decidedAt: string;
};

export type IntelligenceFeedbackView = {
  decisionId: string;
  decisionEventId: string;
  actionRunId: string;
  outcomeStatus: ActionOutcomeStatus | null;
  summary: string | null;
  signals: ActionSignal[];
  data: Record<string, unknown>;
  completedAt: string | null;
};

export type IntelligenceRecommendationResponseView = {
  recommendation: IntelligenceRecommendationView;
  currentDecision: IntelligenceDecisionRecordView | null;
  decisionHistory: IntelligenceDecisionRecordView[];
  feedback: IntelligenceFeedbackView[];
};

export type IntelligenceResponsePatternView = {
  decisionId: string;
  decisionEventId: string;
  actionRunId: string;
  outcomeStatus: ActionOutcomeStatus | null;
  summary: string | null;
  signals: ActionSignal[];
  data: Record<string, unknown>;
  completedAt: string | null;
  /** Patterns describe broader organisational context, not the incident itself. */
  scopeNote: "organisational_context";
};

export type IntelligenceConsumerStatus = {
  acknowledge: ConsumerRunState;
  signalAnalysis: ConsumerRunState;
  riskAssessment: ConsumerRunState;
  recommendationGeneration: ConsumerRunState;
};

export type EventIntelligenceStatus = {
  state: IntelligenceStatusState;
  supported: boolean;
  eventType: string;
  consumers: IntelligenceConsumerStatus;
  notes: string[];
};

export type EventIntelligence = {
  event: IntelligenceEventSummary;
  intelligence: {
    eventSpecific: {
      signals: IntelligenceSignalView[];
      risk: IntelligenceRiskView | null;
      recommendations: IntelligenceRecommendationView[];
      /**
       * Opaque id of the latest succeeded
       * facility.generate_incident_recommendations run for this event.
       * Required by decideRecommendation — never display in UI.
       */
      recommendationActionRunId: string | null;
    };
    humanResponse: {
      recommendations: IntelligenceRecommendationResponseView[];
      decisions: IntelligenceDecisionRecordView[];
    };
    organisationalContext: {
      responsePatterns: IntelligenceResponsePatternView[];
    };
  };
  status: EventIntelligenceStatus;
};

/* -------------------------------------------------------------------------- */
/* Organisation Intelligence (V1 — What Needs Attention?)                     */
/* -------------------------------------------------------------------------- */

export type IntelligencePrioritySeverity = "critical" | "high" | "normal";

export type IntelligencePriorityCategory =
  | "risk"
  | "incident_pattern"
  | "recommendation_response"
  | "recommendation_attention"
  | "operational_lifecycle"
  | "operational_story";

export type IntelligencePriority = {
  /** Stable deterministic id for the grouped finding. */
  id: string;
  severity: IntelligencePrioritySeverity;
  category: IntelligencePriorityCategory;
  title: string;
  summary: string;
  facilityId?: string;
  /** Internal traceability — not for UI display. */
  relatedEventIds?: string[];
  evidence?: Array<{ type: string; value?: unknown }>;
  createdAt?: string;
};

export type IntelligencePattern = {
  id: string;
  category: string;
  severity: "info" | "warning" | "critical";
  title: string;
  summary: string;
  facilityId?: string;
  /** Internal traceability — not for UI display. */
  relatedEventIds?: string[];
  evidence?: Array<{ type: string; value?: unknown }>;
  whatItSaw?: string;
  sequence?: string[];
  score?: number;
};

export type OrganisationRecommendationHealth = {
  /**
   * Decisions recorded in the organisation intelligence window.
   * Does NOT include awaitingDecision — undecided recommendations cannot
   * safely mean "ignored" without a presentation/age contract.
   */
  totalDecisions: number;
  accepted: number;
  dismissed: number;
  deferred: number;
  /** Human-readable organisational response findings (from existing pattern consumer). */
  responsePatterns: IntelligencePattern[];
};

export type OrganisationOperationalContext = {
  /** Canonical Work root activity (facility.maintenance_requested). */
  recentWorkCount30d: number;
  recentWorkCount7d: number;
  /** Legacy historical Incident reports — not the canonical FM path. */
  recentIncidentCount30d: number;
  recentIncidentCount7d: number;
  highOrCriticalRiskCount: number;
  criticalRiskCount: number;
  facilitiesWithRecentActivity: number;
  maintenanceRequestedCount30d: number;
  workOrdersCreatedCount30d: number;
  workOrdersCompletedCount30d: number;
  lifecycleEventCount30d: number;
};

export type OrganisationIntelligenceStatus = {
  state: IntelligenceStatusState;
  supported: boolean;
  notes: string[];
};

/* -------------------------------------------------------------------------- */
/* Organisation Intelligence — change detection (What is changing?)           */
/* -------------------------------------------------------------------------- */

export type IntelligenceChangeDirection =
  | "increasing"
  | "decreasing"
  | "emerging"
  | "stable";

export type IntelligenceChangeIntensity =
  | "small"
  | "meaningful"
  | "significant";

export type IntelligenceChangeCategory =
  | "incident_volume"
  | "incident_risk"
  | "incident_pattern"
  | "recommendation_behaviour";

export type IntelligenceChangeComparisonWindow = {
  recentFrom: string;
  recentTo: string;
  baselineFrom: string;
  baselineTo: string;
  recentDays: 7;
  baselineDays: 7;
  recentAnalysisComplete: boolean;
  baselineAnalysisComplete: boolean;
};

/**
 * Meaningful change vs a previous period — distinct from current-condition priorities.
 */
export type IntelligenceChange = {
  id: string;
  key: string;
  briefingIdentity: string;
  direction: IntelligenceChangeDirection;
  intensity: IntelligenceChangeIntensity;
  category: IntelligenceChangeCategory;
  severity?: IntelligencePrioritySeverity;
  recentCount: number;
  previousCount: number;
  difference: number;
  title: string;
  summary: string;
  /** Whether both comparison windows had complete incident analysis. */
  comparisonStatus?: "complete" | "partial";
};

/**
 * Organisation-level intelligence read model.
 * Aggregates existing Action Engine outcomes — does not recalculate consumers.
 * Operational stories are synthesised from lifecycle pattern findings.
 */
export type OrganisationIntelligence = {
  window: {
    from: string;
    to: string;
    primaryDays: 30;
    recentDays: 7;
  };
  priorities: IntelligencePriority[];
  patterns: IntelligencePattern[];
  changes: IntelligenceChange[];
  comparisonWindow: IntelligenceChangeComparisonWindow;
  recommendationHealth: OrganisationRecommendationHealth;
  operationalContext: OrganisationOperationalContext;
  /**
   * Synthesised operational stories (deterministic clusters of related findings).
   * Empty when evidence is insufficient to connect findings.
   */
  stories: OperationalStorySummary[];
  status: OrganisationIntelligenceStatus;
};

/**
 * Briefing-facing story summary — full evidence remains on priority/pattern
 * investigation payloads via evidence fields.
 */
export type OperationalStorySummary = {
  id: string;
  title: string;
  summary: string;
  status: "emerging" | "active" | "deteriorating" | "stabilising" | "resolved";
  severity: "info" | "low" | "medium" | "high" | "critical";
  score: number;
  confidence: "low" | "medium" | "high";
  facilityId?: string;
  assetIds: string[];
  findingIds: string[];
  relatedEventIds: string[];
  /** Grounded operational record IDs from story synthesis — never invented. */
  incidentIds: string[];
  maintenanceIds: string[];
  workOrderIds: string[];
  sequence: Array<{
    occurredAt: string;
    label: string;
    eventType: string;
    eventId: string;
    entityId?: string;
  }>;
  whyItMatters: string;
  whatToInvestigate: string[];
  whatItSaw: string;
};
