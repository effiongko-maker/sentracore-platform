import type { OperationalPatternFinding } from "@/lib/intelligence/patterns/detectOperationalLifecyclePatterns";
import type { OperationalTimelineEvent } from "@/lib/operational/timeline/types";
import {
  buildStorySequence,
  classifySequenceKind,
  mergeClusterAnchors,
} from "./buildStorySequence";
import { scoreOperationalStory, storyConfidence } from "./scoreOperationalStory";
import { inferStoryStatus } from "./inferStoryStatus";
import type { FindingCluster, OperationalStory } from "./types";

function hoursBetween(fromIso: string, toIso: string): number {
  return Math.max(0, (Date.parse(toIso) - Date.parse(fromIso)) / 36e5);
}

function subjectLabel(storyAnchors: {
  assetIds: string[];
  facilityIds: string[];
}): string {
  if (storyAnchors.assetIds.length === 1) {
    return formatAssetLabel(storyAnchors.assetIds[0]!);
  }
  if (storyAnchors.facilityIds.length === 1) {
    return `activity at ${formatFacilityLabel(storyAnchors.facilityIds[0]!)}`;
  }
  if (storyAnchors.assetIds.length > 1) {
    return `${storyAnchors.assetIds.length} related assets`;
  }
  return "these related issues";
}

function formatAssetLabel(assetId: string): string {
  const cleaned = assetId.replace(/_/g, " ").replace(/-/g, " ").trim();
  if (/^asset\s+/i.test(cleaned)) return cleaned.replace(/^asset\s+/i, "Asset ");
  return `Asset ${cleaned}`;
}

function formatFacilityLabel(facilityId: string): string {
  return facilityId.replace(/_/g, " ").replace(/-/g, " ").trim();
}

function buildTitle(input: {
  sequenceKind: OperationalStory["sequenceKind"];
  status: OperationalStory["status"];
  subject: string;
}): string {
  const { sequenceKind, status, subject } = input;
  if (sequenceKind === "deteriorating" || status === "deteriorating") {
    return `The situation around ${subject} looks like it is getting worse`;
  }
  if (sequenceKind === "failed_intervention") {
    return `Issues returned around ${subject} after maintenance was completed`;
  }
  if (sequenceKind === "response_failure") {
    return `Issues are growing faster than they’re being addressed around ${subject}`;
  }
  if (sequenceKind === "persistent_asset") {
    return `${subject} keeps showing up across incidents, maintenance, and work orders`;
  }
  if (status === "stabilising") {
    return `Things around ${subject} appear to be settling`;
  }
  if (status === "resolved") {
    return `The related issues around ${subject} look resolved`;
  }
  return `Related activity is building around ${subject}`;
}

function buildSummary(input: {
  sequenceKind: OperationalStory["sequenceKind"];
  status: OperationalStory["status"];
  subject: string;
  findings: OperationalPatternFinding[];
  steps: OperationalStory["sequence"];
}): string {
  const associationNote =
    "These activities appear to be connected, but this does not yet confirm that one caused the other.";

  if (input.sequenceKind === "deteriorating") {
    return `Repeated maintenance was followed by delayed work and another incident around ${input.subject}. The underlying issue still looks unresolved. ${associationNote}`;
  }
  if (input.sequenceKind === "failed_intervention") {
    return `After maintenance was completed, further incidents appeared in the same place. ${associationNote}`;
  }
  if (input.sequenceKind === "response_failure") {
    return `Incidents are rising faster than maintenance and work orders around ${input.subject}. ${associationNote}`;
  }
  if (input.sequenceKind === "persistent_asset") {
    return `${input.subject} shows up across incidents, maintenance requests, and work orders in this period. ${associationNote}`;
  }

  const stepCount = input.steps.length;
  return `${input.findings.length} related finding${
    input.findings.length === 1 ? "" : "s"
  } share connected evidence across ${stepCount} activit${
    stepCount === 1 ? "y" : "ies"
  }. Current picture: ${humanStoryStatus(input.status)}. ${associationNote}`;
}

function humanStoryStatus(status: OperationalStory["status"]): string {
  switch (status) {
    case "deteriorating":
      return "getting worse";
    case "stabilising":
      return "settling";
    case "resolved":
      return "resolved";
    case "active":
    default:
      return "still active";
  }
}

function buildWhatItSaw(
  findings: OperationalPatternFinding[],
  steps: OperationalStory["sequence"]
): string {
  const findingSummaries = findings
    .slice(0, 3)
    .map((finding) => finding.whatItSaw)
    .filter(Boolean);
  if (findingSummaries.length > 0) {
    return findingSummaries.join(" ");
  }
  return `${steps.length} related activit${
    steps.length === 1 ? "y" : "ies"
  } form a connected picture worth reviewing.`;
}

function buildWhyItMatters(input: {
  status: OperationalStory["status"];
  sequenceKind: OperationalStory["sequenceKind"];
  unresolvedIncidents: number;
  openWorkOrders: number;
  moduleCount: number;
}): string {
  if (input.status === "deteriorating") {
    return "The situation looks like it is getting worse: unfinished work is sitting alongside continuing incident pressure.";
  }
  if (input.sequenceKind === "failed_intervention") {
    return "Completed maintenance has not stopped further related incidents in this period.";
  }
  if (input.sequenceKind === "response_failure") {
    return "Issues are arriving faster than the team is clearing them, which raises backlog and exposure.";
  }
  if (input.unresolvedIncidents > 0 && input.openWorkOrders > 0) {
    return "Open incidents are still tied to unfinished work.";
  }
  if (input.moduleCount >= 3) {
    return "The same subject spans incidents, maintenance, and work orders, so leaving it unchecked is costly.";
  }
  return "Connected activity suggests this is worth investigating before it escalates further.";
}

function buildWhatToInvestigate(input: {
  sequenceKind: OperationalStory["sequenceKind"];
  status: OperationalStory["status"];
  steps: OperationalStory["sequence"];
  hasDelayedWorkOrder: boolean;
  hasRepeatedMaintenance: boolean;
  hasFailedIntervention: boolean;
  hasUnresolvedIncident: boolean;
}): string[] {
  const questions: string[] = [];

  if (input.hasDelayedWorkOrder) {
    questions.push("Why has this work order not started yet?");
  }
  if (input.hasRepeatedMaintenance) {
    questions.push("Was the earlier maintenance effective, or is the same issue coming back?");
  }
  if (input.hasFailedIntervention) {
    questions.push("Did the completed maintenance address the real problem?");
  }
  if (input.hasUnresolvedIncident) {
    questions.push("What is blocking this incident from being closed?");
  }
  if (
    input.sequenceKind === "persistent_asset" ||
    input.sequenceKind === "deteriorating"
  ) {
    questions.push("Is the underlying asset wearing out or failing repeatedly?");
  }
  if (input.sequenceKind === "response_failure") {
    questions.push("Are similar issues elsewhere also waiting too long for a response?");
  }
  if (questions.length === 0) {
    questions.push("Which linked incidents, assets, or work orders share the same unresolved issue?");
  }

  return questions.slice(0, 4);
}

/**
 * Build one operational story from a correlated finding cluster.
 * Requires enough connected evidence — single weak findings stay standalone.
 */
export function buildOperationalStory(input: {
  cluster: FindingCluster;
  events: OperationalTimelineEvent[];
  windowFrom: string;
  windowTo: string;
  index: number;
}): OperationalStory | null {
  const { cluster, events, windowTo, index } = input;
  const findings = cluster.findings;
  if (findings.length === 0) return null;

  const merged = mergeClusterAnchors(cluster.anchors);
  const sequence = buildStorySequence(events, merged.eventIds);

  // A story needs either multiple correlated findings OR one strong
  // multi-module finding with enough events.
  const moduleTypes = new Set(
    sequence
      .map((step) => step.entityType)
      .filter((value): value is string => !!value)
  );
  const enoughEvidence =
    findings.length >= 2 ||
    (findings.length === 1 &&
      sequence.length >= 4 &&
      moduleTypes.size >= 2 &&
      (merged.assetIds.length > 0 || merged.incidentIds.length > 0));

  if (!enoughEvidence) return null;

  // Facility-only clusters without asset/incident/maintenance/WO links
  // and without complementary multi-finding strength stay separate.
  if (
    findings.length >= 2 &&
    merged.assetIds.length === 0 &&
    merged.incidentIds.length === 0 &&
    merged.maintenanceIds.length === 0 &&
    merged.workOrderIds.length === 0 &&
    merged.eventIds.length < 3
  ) {
    return null;
  }

  const sequenceKind = classifySequenceKind(findings, sequence);
  const status = inferStoryStatus({
    steps: sequence,
    findings,
    sequenceKind,
    windowTo,
  });

  const confidence = storyConfidence({
    findingCount: findings.length,
    eventCount: sequence.length,
    moduleCount: Math.max(moduleTypes.size, 1),
    hasAssetLink: merged.assetIds.length > 0,
    hasStrongEntityLink:
      merged.incidentIds.length > 0 ||
      merged.maintenanceIds.length > 0 ||
      merged.workOrderIds.length > 0 ||
      merged.assetIds.length > 0,
  });

  const firstObservedAt = sequence[0]?.occurredAt ?? input.windowFrom;
  const lastObservedAt = sequence[sequence.length - 1]?.occurredAt ?? windowTo;

  const scored = scoreOperationalStory({
    findings,
    status,
    sequenceKind,
    unresolvedDurationHours: hoursBetween(firstObservedAt, lastObservedAt),
    moduleCount: Math.max(moduleTypes.size, 1),
    entityCount:
      merged.assetIds.length +
      merged.incidentIds.length +
      merged.maintenanceIds.length +
      merged.workOrderIds.length,
    eventCount: sequence.length,
    confidence,
  });

  const subject = subjectLabel(merged);
  const title = buildTitle({ sequenceKind, status, subject });
  const summary = buildSummary({
    sequenceKind,
    status,
    subject,
    findings,
    steps: sequence,
  });

  const hasDelayedWorkOrder = findings.some(
    (finding) => finding.patternKey === "delayed_work_orders"
  );
  const hasRepeatedMaintenance = findings.some(
    (finding) => finding.patternKey === "repeated_maintenance_without_resolution"
  );
  const hasFailedIntervention =
    sequenceKind === "failed_intervention" ||
    findings.some((finding) => finding.patternKey === "incidents_after_maintenance");
  const hasUnresolvedIncident = sequence.some((step) => {
    if (step.eventType !== "facility.incident_reported") return false;
    const id = step.incidentId ?? step.entityId;
    if (!id) return false;
    return !sequence.some(
      (later) =>
        (later.incidentId === id || later.entityId === id) &&
        later.eventType === "facility.incident_resolved"
    );
  });

  const scopeKey =
    merged.assetIds[0] ??
    merged.facilityIds[0] ??
    merged.incidentIds[0] ??
    `cluster-${index}`;

  return {
    id: `story:operational:${scopeKey}:${index}`,
    title,
    summary,
    status,
    severity: scored.severity,
    score: scored.score,
    rank: scored.rank,
    confidence,
    sequenceKind,
    facilityIds: merged.facilityIds,
    assetIds: merged.assetIds,
    incidentIds: merged.incidentIds,
    maintenanceIds: merged.maintenanceIds,
    workOrderIds: merged.workOrderIds,
    findings,
    sequence,
    evidence: {
      eventIds: merged.eventIds,
      entityIds: merged.entityIds,
      facilityIds: merged.facilityIds,
      assetIds: merged.assetIds,
      incidentIds: merged.incidentIds,
      maintenanceIds: merged.maintenanceIds,
      workOrderIds: merged.workOrderIds,
      findingIds: findings.map((finding) => finding.id),
      findingKeys: findings.map((finding) => finding.findingKey),
      eventCount: sequence.length,
      findingCount: findings.length,
      moduleCount: Math.max(moduleTypes.size, 1),
      firstObservedAt,
      lastObservedAt,
      scoreBreakdown: scored.breakdown,
    },
    firstObservedAt,
    lastObservedAt,
    whyItMatters: buildWhyItMatters({
      status,
      sequenceKind,
      unresolvedIncidents: hasUnresolvedIncident ? 1 : 0,
      openWorkOrders: hasDelayedWorkOrder ? 1 : 0,
      moduleCount: Math.max(moduleTypes.size, 1),
    }),
    whatToInvestigate: buildWhatToInvestigate({
      sequenceKind,
      status,
      steps: sequence,
      hasDelayedWorkOrder,
      hasRepeatedMaintenance,
      hasFailedIntervention,
      hasUnresolvedIncident,
    }),
    whatItSaw: buildWhatItSaw(findings, sequence),
    elevateToPriority: scored.elevateToPriority,
  };
}
