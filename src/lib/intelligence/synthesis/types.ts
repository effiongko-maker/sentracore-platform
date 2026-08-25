import type { OperationalPatternFinding } from "@/lib/intelligence/patterns/detectOperationalLifecyclePatterns";

export type OperationalStoryStatus =
  | "emerging"
  | "active"
  | "deteriorating"
  | "stabilising"
  | "resolved";

export type OperationalStorySeverity =
  | "info"
  | "low"
  | "medium"
  | "high"
  | "critical";

export type OperationalStoryConfidence = "low" | "medium" | "high";

export type OperationalStorySequenceKind =
  | "deteriorating"
  | "failed_intervention"
  | "response_failure"
  | "persistent_asset"
  | "related_cluster";

export type OperationalStoryStep = {
  occurredAt: string;
  label: string;
  eventType: string;
  eventId: string;
  entityType?: string;
  entityId?: string;
  facilityId?: string | null;
  assetId?: string | null;
  incidentId?: string | null;
  maintenanceId?: string | null;
  workOrderId?: string | null;
};

export type OperationalStoryEvidence = {
  eventIds: string[];
  entityIds: string[];
  facilityIds: string[];
  assetIds: string[];
  incidentIds: string[];
  maintenanceIds: string[];
  workOrderIds: string[];
  findingIds: string[];
  findingKeys: string[];
  eventCount: number;
  findingCount: number;
  moduleCount: number;
  firstObservedAt: string;
  lastObservedAt: string;
  scoreBreakdown: Record<string, number>;
};

/**
 * Coherent cluster of related operational findings and lifecycle events.
 * Deterministic and evidence-backed — not LLM-invented.
 */
export type OperationalStory = {
  id: string;
  title: string;
  summary: string;
  status: OperationalStoryStatus;
  severity: OperationalStorySeverity;
  score: number;
  rank: number;
  confidence: OperationalStoryConfidence;
  sequenceKind: OperationalStorySequenceKind;
  facilityIds: string[];
  assetIds: string[];
  incidentIds: string[];
  maintenanceIds: string[];
  workOrderIds: string[];
  findings: OperationalPatternFinding[];
  sequence: OperationalStoryStep[];
  evidence: OperationalStoryEvidence;
  firstObservedAt: string;
  lastObservedAt: string;
  whyItMatters: string;
  whatToInvestigate: string[];
  whatItSaw: string;
  elevateToPriority: boolean;
};

export type FindingAnchors = {
  findingId: string;
  findingKey: string;
  patternKey: string;
  facilityIds: string[];
  assetIds: string[];
  incidentIds: string[];
  maintenanceIds: string[];
  workOrderIds: string[];
  entityIds: string[];
  eventIds: string[];
  score: number;
  severity: OperationalPatternFinding["severity"];
};

export type CorrelationStrength = "strong" | "medium" | "weak" | "none";

export type FindingCluster = {
  id: string;
  findings: OperationalPatternFinding[];
  anchors: FindingAnchors[];
};
