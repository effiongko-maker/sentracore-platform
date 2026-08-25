import { OperationalEventTypes } from "@/lib/events/taxonomy";
import type {
  OperationalStorySequenceKind,
  OperationalStoryStatus,
  OperationalStoryStep,
} from "./types";
import type { OperationalPatternFinding } from "@/lib/intelligence/patterns/detectOperationalLifecyclePatterns";

/**
 * Infer story status from the most recent lifecycle evidence.
 * Work order completion alone never marks a story resolved.
 */
export function inferStoryStatus(input: {
  steps: OperationalStoryStep[];
  findings: OperationalPatternFinding[];
  sequenceKind: OperationalStorySequenceKind;
  windowTo: string;
}): OperationalStoryStatus {
  const { steps, findings, sequenceKind } = input;
  if (steps.length === 0) return "emerging";

  const keys = new Set(findings.map((finding) => finding.patternKey));
  const ordered = [...steps].sort(
    (a, b) => Date.parse(a.occurredAt) - Date.parse(b.occurredAt)
  );
  const latest = ordered[ordered.length - 1]!;

  const incidentIds = unique(
    ordered
      .map((step) => step.incidentId ?? (step.entityType === "incident" ? step.entityId : null))
      .filter((id): id is string => !!id)
  );

  const unresolvedIncidents = incidentIds.filter((incidentId) => {
    const reported = ordered.some(
      (step) =>
        (step.incidentId === incidentId || step.entityId === incidentId) &&
        step.eventType === OperationalEventTypes.FACILITY_INCIDENT_REPORTED
    );
    const resolved = ordered.some(
      (step) =>
        (step.incidentId === incidentId || step.entityId === incidentId) &&
        step.eventType === OperationalEventTypes.FACILITY_INCIDENT_RESOLVED
    );
    return reported && !resolved;
  });

  const hasRecentCompletion = ordered.some(
    (step) =>
      step.eventType === OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED ||
      step.eventType === OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED
  );

  const hasRecentIncident =
    latest.eventType === OperationalEventTypes.FACILITY_INCIDENT_REPORTED ||
    latest.eventType === OperationalEventTypes.FACILITY_INCIDENT_ESCALATED;

  const allIncidentsResolved =
    incidentIds.length > 0 && unresolvedIncidents.length === 0;

  const openWorkOrders = ordered.filter(
    (step) =>
      step.eventType === OperationalEventTypes.FACILITY_WORK_ORDER_CREATED
  ).filter((created) => {
    const entityId = created.entityId;
    if (!entityId) return true;
    return !ordered.some(
      (step) =>
        step.entityId === entityId &&
        (step.eventType ===
          OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED ||
          step.eventType ===
            OperationalEventTypes.FACILITY_WORK_ORDER_CANCELLED)
    );
  });

  // Explicit resolution of the chain: all related incidents resolved and
  // no open work orders / unresolved maintenance findings.
  if (
    allIncidentsResolved &&
    openWorkOrders.length === 0 &&
    !keys.has("repeated_maintenance_without_resolution") &&
    !keys.has("operational_backlog") &&
    !keys.has("delayed_work_orders")
  ) {
    return "resolved";
  }

  if (
    sequenceKind === "deteriorating" ||
    sequenceKind === "failed_intervention" ||
    hasRecentIncident ||
    unresolvedIncidents.length > 0 &&
      (keys.has("delayed_work_orders") ||
        keys.has("repeated_maintenance_without_resolution") ||
        keys.has("maintenance_precedes_incident"))
  ) {
    if (
      sequenceKind === "deteriorating" ||
      sequenceKind === "failed_intervention" ||
      (unresolvedIncidents.length > 0 && openWorkOrders.length > 0)
    ) {
      return "deteriorating";
    }
  }

  // Stabilising: completions appearing and no new unresolved incident surge.
  if (
    hasRecentCompletion &&
    unresolvedIncidents.length === 0 &&
    !keys.has("incidents_outpacing_response") &&
    (latest.eventType === OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED ||
      latest.eventType === OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED ||
      latest.eventType === OperationalEventTypes.FACILITY_INCIDENT_RESOLVED)
  ) {
    return "stabilising";
  }

  if (findings.length === 1 && findings[0]!.score < 40) {
    return "emerging";
  }

  if (unresolvedIncidents.length > 0 || openWorkOrders.length > 0) {
    return "active";
  }

  if (findings.length >= 2) return "active";
  return "emerging";
}

function unique(values: Array<string | null | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => !!value))];
}
