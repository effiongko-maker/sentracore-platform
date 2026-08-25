import { OperationalEventTypes } from "@/lib/events/taxonomy";
import { eventTypeToHistoryLabel } from "@/lib/operational/context/types";
import type { OperationalTimelineEvent } from "@/lib/operational/timeline/types";
import type {
  OperationalStorySequenceKind,
  OperationalStoryStep,
} from "./types";
import type { FindingAnchors } from "./types";
import type { OperationalPatternFinding } from "@/lib/intelligence/patterns/detectOperationalLifecyclePatterns";

function unique<T>(values: T[]): T[] {
  return [...new Set(values)];
}

function eventToStep(event: OperationalTimelineEvent): OperationalStoryStep {
  const workOrderId =
    event.workOrderIds?.[0] ??
    (event.entityType === "work_order" ? event.entityId : null);

  return {
    occurredAt: event.occurredAt,
    label: eventTypeToHistoryLabel(event.eventType),
    eventType: event.eventType,
    eventId: event.id,
    entityType: String(event.entityType),
    entityId: event.entityId,
    facilityId: event.facilityId,
    assetId: event.assetId,
    incidentId: event.incidentId ?? null,
    maintenanceId: event.maintenanceId ?? null,
    workOrderId: workOrderId ?? null,
  };
}

/**
 * Build chronological evidence-backed sequence from related lifecycle events.
 */
export function buildStorySequence(
  events: OperationalTimelineEvent[],
  eventIds: string[]
): OperationalStoryStep[] {
  const idSet = new Set(eventIds);
  return events
    .filter((event) => idSet.has(event.id))
    .sort((a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt))
    .map(eventToStep);
}

/**
 * Classify the structural sequence kind from pattern keys + event progression.
 * Structure first — prose is derived later.
 */
export function classifySequenceKind(
  findings: OperationalPatternFinding[],
  steps: OperationalStoryStep[]
): OperationalStorySequenceKind {
  const keys = new Set(findings.map((finding) => finding.patternKey));

  const hasRepeatedMaintenance = keys.has("repeated_maintenance_without_resolution");
  const hasPrecedes = keys.has("maintenance_precedes_incident");
  const hasDelayed = keys.has("delayed_work_orders");
  const hasAfter = keys.has("incidents_after_maintenance");
  const hasAsset = keys.has("asset_recurrence");
  const hasOutpace = keys.has("incidents_outpacing_response");
  const hasBacklog = keys.has("operational_backlog");

  const hasMaintenanceRequested = steps.some(
    (step) =>
      step.eventType === OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED
  );
  const hasMaintenanceCompleted = steps.some(
    (step) =>
      step.eventType === OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED
  );
  const hasIncidentReported = steps.some(
    (step) =>
      step.eventType === OperationalEventTypes.FACILITY_INCIDENT_REPORTED
  );
  const hasWorkOrderCreated = steps.some(
    (step) =>
      step.eventType === OperationalEventTypes.FACILITY_WORK_ORDER_CREATED
  );
  const hasWorkOrderStarted = steps.some(
    (step) =>
      step.eventType === OperationalEventTypes.FACILITY_WORK_ORDER_STARTED ||
      step.eventType === OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED
  );
  const hasIncidentResolved = steps.some(
    (step) =>
      step.eventType === OperationalEventTypes.FACILITY_INCIDENT_RESOLVED
  );

  if (
    hasAfter ||
    (hasMaintenanceCompleted &&
      hasIncidentReported &&
      steps.some(
        (step) =>
          step.eventType ===
            OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED &&
          steps.some(
            (later) =>
              later.eventType ===
                OperationalEventTypes.FACILITY_INCIDENT_REPORTED &&
              Date.parse(later.occurredAt) > Date.parse(step.occurredAt)
          )
      ))
  ) {
    return "failed_intervention";
  }

  if (
    (hasRepeatedMaintenance || hasPrecedes) &&
    (hasDelayed || hasWorkOrderCreated) &&
    hasIncidentReported
  ) {
    return "deteriorating";
  }

  if (
    hasRepeatedMaintenance &&
    hasIncidentReported &&
    !hasIncidentResolved
  ) {
    return "deteriorating";
  }

  if (hasOutpace || (hasBacklog && hasIncidentReported && hasDelayed)) {
    return "response_failure";
  }

  if (
    hasAsset ||
    (hasMaintenanceRequested && hasWorkOrderCreated && hasIncidentReported)
  ) {
    return "persistent_asset";
  }

  if (
    hasWorkOrderCreated &&
    !hasWorkOrderStarted &&
    hasIncidentReported &&
    !hasIncidentResolved
  ) {
    return "deteriorating";
  }

  return "related_cluster";
}

export function mergeClusterAnchors(anchors: FindingAnchors[]): {
  facilityIds: string[];
  assetIds: string[];
  incidentIds: string[];
  maintenanceIds: string[];
  workOrderIds: string[];
  eventIds: string[];
  entityIds: string[];
} {
  return {
    facilityIds: unique(anchors.flatMap((a) => a.facilityIds)),
    assetIds: unique(anchors.flatMap((a) => a.assetIds)),
    incidentIds: unique(anchors.flatMap((a) => a.incidentIds)),
    maintenanceIds: unique(anchors.flatMap((a) => a.maintenanceIds)),
    workOrderIds: unique(anchors.flatMap((a) => a.workOrderIds)),
    eventIds: unique(anchors.flatMap((a) => a.eventIds)),
    entityIds: unique(anchors.flatMap((a) => a.entityIds)),
  };
}
