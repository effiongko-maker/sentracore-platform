import {
  classificationFromRequestType,
  mapIncidentTypeToClassification,
  mapRequestStatusToIssueStatus,
  mapSeverityToIssuePriority,
} from "./status";
import {
  mapIncidentToTreatmentRef,
  mapMaintenanceToTreatmentRef,
  mapWorkOrderToIssueRef,
} from "./mapTreatments";
import type {
  ComposeIssueFromRequestInput,
  Issue,
  IssueWorkOrderRef,
} from "./types";

/**
 * Compose a Request-backed Issue from authoritative domain records.
 *
 * - Issue.status ← Request.status (Track Request SoT unchanged)
 * - Treatments ← Maintenance / Incident rows linked on the Request
 * - Work Orders ← related WO rows (and ids on Request / children)
 *
 * Does not write Sheets, mutate Request, or invent statuses.
 */
export function composeIssueFromRequest(
  input: ComposeIssueFromRequestInput
): Issue {
  const { request } = input;
  const maintenances = (input.maintenances ?? []).filter(
    (row): row is NonNullable<typeof row> => Boolean(row)
  );
  const incidents = (input.incidents ?? []).filter(
    (row): row is NonNullable<typeof row> => Boolean(row)
  );
  const workOrders = (input.workOrders ?? []).filter(
    (row): row is NonNullable<typeof row> => Boolean(row)
  );

  const treatments = [
    ...maintenances.map(mapMaintenanceToTreatmentRef),
    ...incidents.map(mapIncidentToTreatmentRef),
  ];

  const woById = new Map<string, IssueWorkOrderRef>();
  for (const wo of workOrders) {
    woById.set(wo.id, mapWorkOrderToIssueRef(wo));
  }
  for (const m of maintenances) {
    const ids = [
      ...(m.workOrderIds ?? []),
      ...(m.workOrderId ? [m.workOrderId] : []),
    ];
    for (const id of ids) {
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
  for (const inc of incidents) {
    const ids = [
      ...(inc.workOrderIds ?? []),
      ...(inc.workOrderId ? [inc.workOrderId] : []),
    ];
    for (const id of ids) {
      if (!woById.has(id)) {
        woById.set(id, {
          id,
          status: "unknown",
          viaTreatmentId: inc.id,
          viaTreatmentKind: "incident_handling",
        });
      }
    }
  }
  for (const id of request.workOrderIds ?? []) {
    if (!woById.has(id)) {
      woById.set(id, { id, status: "unknown" });
    }
  }

  const hasActiveTreatment = treatments.some(
    (t) => !t.isSuccessfullyTerminal && !t.isCancelled
  );
  const hasSuccessfulTreatment = treatments.some(
    (t) => t.isSuccessfullyTerminal
  );

  const primaryIncident = incidents[0];
  const classification =
    mapIncidentTypeToClassification(primaryIncident?.type) ??
    classificationFromRequestType(request.requestType);

  const priority =
    mapSeverityToIssuePriority(primaryIncident?.severity) ??
    mapSeverityToIssuePriority(maintenances[0]?.priority);

  const assetId =
    maintenances.find((m) => m.assetId)?.assetId ||
    incidents.find((i) => i.assetId)?.assetId;

  const successful = treatments.filter((t) => t.isSuccessfullyTerminal);
  const resolutionSummary =
    successful.length > 0
      ? successful
          .map((t) => `${t.kind}:${t.id} (${t.status})`)
          .join("; ")
      : undefined;

  const resolvedAt =
    mapRequestStatusToIssueStatus(request.status) === "resolved"
      ? incidents.find((i) => i.resolvedAt)?.resolvedAt ||
        maintenances.find((m) => m.completedAt)?.completedAt ||
        request.updatedAt
      : undefined;

  return {
    id: `issue:request:${request.id}`,
    reference: request.id,
    title: request.title,
    description: request.description,
    source: "staff_request",
    reportedBy: {
      userId: request.reportedByUserId,
      name: request.reporterName,
      contact: request.reporterContact,
    },
    locationDetail: request.locationDetail,
    facilityId: request.facilityId,
    assetId,
    priority,
    classification,
    status: mapRequestStatusToIssueStatus(request.status),
    treatmentState: {
      hasActiveTreatment,
      hasSuccessfulTreatment,
      treatmentCount: treatments.length,
    },
    relatedRequestId: request.id,
    treatments,
    relatedIncidentIds: incidents.map((i) => i.id),
    workOrders: [...woById.values()],
    createdAt: request.createdAt,
    updatedAt: request.updatedAt,
    resolvedAt,
    resolutionSummary,
  };
}
