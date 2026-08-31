import {
  mapIncidentTypeToClassification,
  mapIncidentStatusToIssueStatus,
  mapMaintenanceStatusToIssueStatus,
  mapSeverityToIssuePriority,
} from "./status";
import {
  mapIncidentToTreatmentRef,
  mapMaintenanceToTreatmentRef,
  mapWorkOrderToIssueRef,
} from "./mapTreatments";
import type {
  ComposeIssueFromIncidentInput,
  ComposeIssueFromMaintenanceInput,
  Issue,
  IssueWorkOrderRef,
} from "./types";

/**
 * Compose an FM ordinary Issue with Maintenance as authoritative root.
 * No Request invented. Issue.status ← Maintenance.status.
 */
export function composeIssueFromMaintenance(
  input: ComposeIssueFromMaintenanceInput
): Issue {
  const m = input.maintenance;
  const workOrders = (input.workOrders ?? []).filter(
    (row): row is NonNullable<typeof row> => Boolean(row)
  );
  const relatedIncident = input.relatedIncident ?? null;

  const treatments = [mapMaintenanceToTreatmentRef(m)];
  if (relatedIncident) {
    treatments.push(mapIncidentToTreatmentRef(relatedIncident));
  }

  const woById = new Map<string, IssueWorkOrderRef>();
  for (const wo of workOrders) {
    woById.set(wo.id, mapWorkOrderToIssueRef(wo));
  }
  for (const id of [
    ...(m.workOrderIds ?? []),
    ...(m.workOrderId ? [m.workOrderId] : []),
  ]) {
    if (!woById.has(id)) {
      woById.set(id, {
        id,
        status: "unknown",
        viaTreatmentId: m.id,
        viaTreatmentKind: "maintenance",
      });
    }
  }

  const status = mapMaintenanceStatusToIssueStatus(m.status);
  const hasActiveTreatment = treatments.some(
    (t) => !t.isSuccessfullyTerminal && !t.isCancelled
  );
  const hasSuccessfulTreatment = treatments.some(
    (t) => t.isSuccessfullyTerminal
  );

  return {
    id: `issue:maintenance:${m.id}`,
    reference: m.id,
    title: m.title,
    description: m.description,
    source: m.sourceRequestId ? "staff_request" : "facility_manager",
    reportedBy: m.createdByUserId
      ? { userId: m.createdByUserId }
      : undefined,
    locationDetail: m.locationDetail,
    facilityId: m.facilityId,
    assetId: m.assetId,
    priority: mapSeverityToIssuePriority(m.priority),
    classification:
      mapIncidentTypeToClassification(relatedIncident?.type) ?? "routine",
    status,
    treatmentState: {
      hasActiveTreatment,
      hasSuccessfulTreatment,
      treatmentCount: treatments.length,
    },
    relatedRequestId: m.sourceRequestId,
    rootMaintenanceId: m.id,
    treatments,
    relatedIncidentIds: relatedIncident ? [relatedIncident.id] : [],
    workOrders: [...woById.values()],
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
    resolvedAt: status === "resolved" ? m.completedAt || m.updatedAt : undefined,
    resolutionSummary:
      status === "resolved"
        ? m.completionNotes || `maintenance:${m.id} (${m.status})`
        : undefined,
  };
}

/**
 * Compose an FM significant-event Issue with Incident as authoritative root.
 * No Request invented. Issue.status ← Incident.status.
 */
export function composeIssueFromIncident(
  input: ComposeIssueFromIncidentInput
): Issue {
  const inc = input.incident;
  const maintenances = (input.maintenances ?? []).filter(
    (row): row is NonNullable<typeof row> => Boolean(row)
  );
  const workOrders = (input.workOrders ?? []).filter(
    (row): row is NonNullable<typeof row> => Boolean(row)
  );

  const treatments = [
    mapIncidentToTreatmentRef(inc),
    ...maintenances.map(mapMaintenanceToTreatmentRef),
  ];

  const woById = new Map<string, IssueWorkOrderRef>();
  for (const wo of workOrders) {
    woById.set(wo.id, mapWorkOrderToIssueRef(wo));
  }
  for (const id of [
    ...(inc.workOrderIds ?? []),
    ...(inc.workOrderId ? [inc.workOrderId] : []),
  ]) {
    if (!woById.has(id)) {
      woById.set(id, {
        id,
        status: "unknown",
        viaTreatmentId: inc.id,
        viaTreatmentKind: "incident_handling",
      });
    }
  }
  for (const m of maintenances) {
    for (const id of [
      ...(m.workOrderIds ?? []),
      ...(m.workOrderId ? [m.workOrderId] : []),
    ]) {
      if (!woById.has(id)) {
        woById.set(id, {
          id,
          status: "unknown",
          viaTreatmentId: m.id,
          viaTreatmentKind: "maintenance",
        });
      }
    }
  }

  const status = mapIncidentStatusToIssueStatus(inc.status);
  const hasActiveTreatment = treatments.some(
    (t) => !t.isSuccessfullyTerminal && !t.isCancelled
  );
  const hasSuccessfulTreatment = treatments.some(
    (t) => t.isSuccessfullyTerminal
  );

  return {
    id: `issue:incident:${inc.id}`,
    reference: inc.id,
    title: inc.title,
    description: inc.description,
    source: inc.sourceRequestId ? "staff_request" : "facility_manager",
    reportedBy: inc.reportedByUserId
      ? { userId: inc.reportedByUserId }
      : undefined,
    locationDetail: inc.locationDetail,
    facilityId: inc.facilityId,
    assetId: inc.assetId,
    priority: mapSeverityToIssuePriority(inc.severity),
    classification: mapIncidentTypeToClassification(inc.type) ?? "other",
    status,
    treatmentState: {
      hasActiveTreatment,
      hasSuccessfulTreatment,
      treatmentCount: treatments.length,
    },
    relatedRequestId: inc.sourceRequestId,
    rootIncidentId: inc.id,
    treatments,
    relatedIncidentIds: [inc.id],
    workOrders: [...woById.values()],
    createdAt: inc.createdAt,
    updatedAt: inc.updatedAt,
    resolvedAt:
      status === "resolved" ? inc.resolvedAt || inc.updatedAt : undefined,
    resolutionSummary:
      status === "resolved"
        ? inc.resolutionNotes || `incident_handling:${inc.id} (${inc.status})`
        : undefined,
  };
}
