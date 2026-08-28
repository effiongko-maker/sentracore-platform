import { emitActionEvent, type ActionContext } from "@/lib/actions";
import { ActionError } from "@/lib/actions/errors";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import {
  requestCreateIncidentLeaseKey,
  requestCreateMaintenanceLeaseKey,
  requestLinkIncidentLeaseKey,
  requestLinkMaintenanceLeaseKey,
  runExclusiveOperationalAction,
} from "@/lib/operational/idempotency/actionLease";
import { appendUniqueId } from "@/lib/operational/idLists";
import {
  assertRequestCancellable,
  assertRequestResolvable,
  assertRequestTreatable,
} from "@/modules/requests/treatment/assertStatus";
import { statusAfterTreatment } from "@/modules/requests/treatment/status";
import type { LinkableSearchHit } from "@/modules/requests/treatment/types";
import type {
  DerivedWorkOrderLink,
  RequestTreatmentDetail,
} from "@/modules/requests/treatment/detailTypes";
import type { CreateIncidentInput, Incident } from "@/modules/incidents/types";
import type {
  CreateMaintenanceInput,
  Maintenance,
} from "@/modules/maintenance/types";
import type { RequestRecord } from "@/modules/requests/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { RequestService } from "@/services/requests/RequestService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import {
  incidentEventData,
  maintenanceEventData,
  withIntakeMetadata,
} from "@/lib/operational/events/payloads";

export type { LinkableSearchHit } from "@/modules/requests/treatment/types";
export type {
  DerivedWorkOrderLink,
  RequestTreatmentDetail,
} from "@/modules/requests/treatment/detailTypes";

async function createMaintenanceChild(
  input: CreateMaintenanceInput,
  context: ActionContext,
  sourceReference: string
): Promise<Maintenance> {
  const created = await MaintenanceService.createMaintenance(input);
  try {
    const event = await emitActionEvent(context, {
      eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
      entityType: "maintenance_request",
      entityId: String(created.id),
      data: withIntakeMetadata(
        maintenanceEventData(created, {
          actor: context.userId,
          transitionSource: "specialised_action",
        }),
        "staff",
        sourceReference
      ),
    });
    try {
      await MaintenanceService.updateMaintenance(created.id, {
        operationalEventId: event.id,
      });
    } catch {
      // non-blocking
    }
  } catch (eventError) {
    console.error("[requestTreatment] maintenance event failed", {
      maintenanceId: created.id,
      error:
        eventError instanceof Error ? eventError.message : String(eventError),
    });
  }
  return created;
}

async function createIncidentChild(
  input: CreateIncidentInput,
  context: ActionContext,
  sourceReference: string
): Promise<Incident> {
  const created = await IncidentService.createIncident(input);
  try {
    const event = await emitActionEvent(context, {
      eventType: OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
      entityType: "incident",
      entityId: created.id,
      data: withIntakeMetadata(
        incidentEventData(created, {
          actor: context.userId,
          transitionSource: "specialised_action",
        }),
        "staff",
        sourceReference
      ),
    });
    try {
      await IncidentService.updateIncident(created.id, {
        operationalEventId: event.id,
      });
    } catch {
      // non-blocking
    }
  } catch (eventError) {
    console.error("[requestTreatment] incident event failed", {
      incidentId: created.id,
      error:
        eventError instanceof Error ? eventError.message : String(eventError),
    });
  }
  return created;
}

export type RequestTreatmentResult = {
  request: RequestRecord;
  maintenance?: Maintenance;
  incident?: Incident;
};

async function loadRequestOrThrow(requestId: string): Promise<RequestRecord> {
  const request = await RequestService.getRequest(requestId);
  if (!request) {
    throw new ActionError(
      "VALIDATION_ERROR",
      `Request ${requestId} not found.`
    );
  }
  return request;
}

async function appendMaintenanceLink(
  request: RequestRecord,
  maintenanceId: string,
  actorUserId: string
): Promise<RequestRecord> {
  const maintenanceIds = appendUniqueId(
    request.maintenanceIds ?? [],
    maintenanceId
  );
  const status = statusAfterTreatment(request.status);
  return RequestService.updateRequest({
    id: request.id,
    maintenanceIds,
    status,
    updatedByUserId: actorUserId,
  });
}

async function appendIncidentLink(
  request: RequestRecord,
  incidentId: string,
  actorUserId: string
): Promise<RequestRecord> {
  const incidentIds = appendUniqueId(request.incidentIds ?? [], incidentId);
  const status = statusAfterTreatment(request.status);
  return RequestService.updateRequest({
    id: request.id,
    incidentIds,
    status,
    updatedByUserId: actorUserId,
  });
}

async function compensateClearMaintenanceSource(
  maintenanceId: string,
  expectedRequestId: string
): Promise<void> {
  try {
    const child = await MaintenanceService.getMaintenance(maintenanceId);
    if (!child) return;
    if (child.sourceRequestId !== expectedRequestId) return;
    await MaintenanceService.updateMaintenance(maintenanceId, {
      sourceRequestId: "",
    });
  } catch (error) {
    console.error("[requestTreatment] compensation failed (maintenance)", {
      maintenanceId,
      expectedRequestId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ActionError(
      "INTERNAL_ERROR",
      `Request link update failed after creating ${maintenanceId}. Compensation to clear sourceRequestId also failed — manual repair required.`
    );
  }
}

async function compensateClearIncidentSource(
  incidentId: string,
  expectedRequestId: string
): Promise<void> {
  try {
    const child = await IncidentService.getIncident(incidentId);
    if (!child) return;
    if (child.sourceRequestId !== expectedRequestId) return;
    await IncidentService.updateIncident(incidentId, {
      sourceRequestId: "",
    });
  } catch (error) {
    console.error("[requestTreatment] compensation failed (incident)", {
      incidentId,
      expectedRequestId,
      error: error instanceof Error ? error.message : String(error),
    });
    throw new ActionError(
      "INTERNAL_ERROR",
      `Request link update failed after creating ${incidentId}. Compensation to clear sourceRequestId also failed — manual repair required.`
    );
  }
}

function assertChildLinkable(
  sourceRequestId: string | undefined,
  requestId: string,
  childId: string
): "already_linked" | "linkable" {
  const existing = sourceRequestId?.trim();
  if (!existing) return "linkable";
  if (existing === requestId) return "already_linked";
  throw new ActionError(
    "VALIDATION_ERROR",
    `${childId} is already linked to ${existing} and cannot be reassigned.`
  );
}

export async function orchestrateCreateMaintenanceFromRequest(options: {
  requestId: string;
  input: CreateMaintenanceInput;
  idempotencyKey: string;
  context: ActionContext;
}): Promise<RequestTreatmentResult> {
  const request = await loadRequestOrThrow(options.requestId);
  assertRequestTreatable(request);

  const idempotencyKey = options.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new ActionError(
      "VALIDATION_ERROR",
      "Idempotency key is required."
    );
  }

  const writeInput: CreateMaintenanceInput = {
    ...options.input,
    source: options.input.source ?? "request",
    sourceRequestId: request.id,
    createdByUserId: options.context.userId,
    updatedByUserId: options.context.userId,
  };

  const maintenance = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestCreateMaintenanceLeaseKey(request.id, idempotencyKey),
    actorProfileId: options.context.userId,
    entityType: "maintenance",
    recoverExisting: async () => {
      const fresh = await loadRequestOrThrow(request.id);
      // Lease completed previously — recover by sourceRequestId + recent match not reliable.
      // Prefer lease result_entity_id via loadByEntityId.
      return null;
    },
    loadByEntityId: async (entityId) => {
      const row = await MaintenanceService.getMaintenance(entityId);
      if (!row) return null;
      return { entityId: row.id, value: row };
    },
    create: async () => {
      const created = await createMaintenanceChild(
        writeInput,
        options.context,
        request.id
      );
      return { entityId: created.id, value: created };
    },
  });

  // Idempotent: already on request list
  if ((request.maintenanceIds ?? []).includes(maintenance.id)) {
    const fresh = await loadRequestOrThrow(request.id);
    return { request: fresh, maintenance };
  }

  try {
    const updated = await appendMaintenanceLink(
      await loadRequestOrThrow(request.id),
      maintenance.id,
      options.context.userId
    );

    try {
      await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_REQUEST_MAINTENANCE_CREATED,
        entityType: "request",
        entityId: updated.id,
        data: {
          requestId: updated.id,
          maintenanceId: maintenance.id,
          actor: options.context.userId,
        },
      });
    } catch (eventError) {
      console.error("[orchestrateCreateMaintenanceFromRequest] event failed", {
        error:
          eventError instanceof Error ? eventError.message : String(eventError),
      });
    }

    return { request: updated, maintenance };
  } catch (error) {
    await compensateClearMaintenanceSource(maintenance.id, request.id);
    if (error instanceof ActionError) throw error;
    const detail =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "unknown error";
    throw new ActionError(
      "INTERNAL_ERROR",
      `Maintenance ${maintenance.id} was created but Request link failed (${detail}). Child sourceRequestId was cleared.`,
      { cause: error }
    );
  }
}

export async function orchestrateCreateIncidentFromRequest(options: {
  requestId: string;
  input: CreateIncidentInput;
  idempotencyKey: string;
  context: ActionContext;
}): Promise<RequestTreatmentResult> {
  const request = await loadRequestOrThrow(options.requestId);
  assertRequestTreatable(request);

  const idempotencyKey = options.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new ActionError(
      "VALIDATION_ERROR",
      "Idempotency key is required."
    );
  }

  const writeInput: CreateIncidentInput = {
    ...options.input,
    source: options.input.source ?? "request",
    sourceRequestId: request.id,
    createdByUserId: options.context.userId,
    updatedByUserId: options.context.userId,
  };

  const incident = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestCreateIncidentLeaseKey(request.id, idempotencyKey),
    actorProfileId: options.context.userId,
    entityType: "incident",
    recoverExisting: async () => null,
    loadByEntityId: async (entityId) => {
      const row = await IncidentService.getIncident(entityId);
      if (!row) return null;
      return { entityId: row.id, value: row };
    },
    create: async () => {
      const created = await createIncidentChild(
        writeInput,
        options.context,
        request.id
      );
      return { entityId: created.id, value: created };
    },
  });

  if ((request.incidentIds ?? []).includes(incident.id)) {
    const fresh = await loadRequestOrThrow(request.id);
    return { request: fresh, incident };
  }

  try {
    const updated = await appendIncidentLink(
      await loadRequestOrThrow(request.id),
      incident.id,
      options.context.userId
    );

    try {
      await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_REQUEST_INCIDENT_CREATED,
        entityType: "request",
        entityId: updated.id,
        data: {
          requestId: updated.id,
          incidentId: incident.id,
          actor: options.context.userId,
        },
      });
    } catch (eventError) {
      console.error("[orchestrateCreateIncidentFromRequest] event failed", {
        error:
          eventError instanceof Error ? eventError.message : String(eventError),
      });
    }

    return { request: updated, incident };
  } catch (error) {
    await compensateClearIncidentSource(incident.id, request.id);
    if (error instanceof ActionError) throw error;
    const detail =
      error instanceof Error && error.message.trim()
        ? error.message.trim()
        : "unknown error";
    throw new ActionError(
      "INTERNAL_ERROR",
      `Incident ${incident.id} was created but Request link failed (${detail}). Child sourceRequestId was cleared.`,
      { cause: error }
    );
  }
}

export async function orchestrateLinkMaintenanceToRequest(options: {
  requestId: string;
  maintenanceId: string;
  context: ActionContext;
}): Promise<RequestTreatmentResult> {
  const request = await loadRequestOrThrow(options.requestId);
  assertRequestTreatable(request);

  const maintenanceId = options.maintenanceId.trim();
  if (!maintenanceId) {
    throw new ActionError("VALIDATION_ERROR", "Maintenance id is required.");
  }

  const result = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestLinkMaintenanceLeaseKey(request.id, maintenanceId),
    actorProfileId: options.context.userId,
    entityType: "maintenance",
    recoverExisting: async () => {
      const freshReq = await loadRequestOrThrow(request.id);
      const child = await MaintenanceService.getMaintenance(maintenanceId);
      if (!child) return null;
      if (
        child.sourceRequestId === request.id &&
        (freshReq.maintenanceIds ?? []).includes(maintenanceId)
      ) {
        return { entityId: child.id, value: child };
      }
      return null;
    },
    loadByEntityId: async (entityId) => {
      const row = await MaintenanceService.getMaintenance(entityId);
      if (!row) return null;
      return { entityId: row.id, value: row };
    },
    create: async () => {
      const child = await MaintenanceService.getMaintenance(maintenanceId);
      if (!child) {
        throw new ActionError(
          "VALIDATION_ERROR",
          `Maintenance ${maintenanceId} not found.`
        );
      }

      const linkState = assertChildLinkable(child.sourceRequestId, request.id, child.id);
      if (linkState === "linkable") {
        await MaintenanceService.updateMaintenance(child.id, {
          sourceRequestId: request.id,
          updatedByUserId: options.context.userId,
        });
      }

      const freshReq = await loadRequestOrThrow(request.id);
      if (!(freshReq.maintenanceIds ?? []).includes(child.id)) {
        try {
          await appendMaintenanceLink(
            freshReq,
            child.id,
            options.context.userId
          );
        } catch (error) {
          if (linkState === "linkable") {
            await compensateClearMaintenanceSource(child.id, request.id);
          }
          throw error instanceof ActionError
            ? error
            : new ActionError(
                "INTERNAL_ERROR",
                `Failed to append ${child.id} on Request after setting sourceRequestId.`,
                { cause: error }
              );
        }
      }

      const linked = await MaintenanceService.getMaintenance(child.id);
      if (!linked) {
        throw new ActionError(
          "INTERNAL_ERROR",
          `Maintenance ${child.id} missing after link.`
        );
      }
      return { entityId: linked.id, value: linked };
    },
  });

  const updated = await loadRequestOrThrow(request.id);

  try {
    await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_REQUEST_MAINTENANCE_LINKED,
      entityType: "request",
      entityId: updated.id,
      data: {
        requestId: updated.id,
        maintenanceId: result.id,
        actor: options.context.userId,
      },
    });
  } catch {
    // non-blocking
  }

  return { request: updated, maintenance: result };
}

export async function orchestrateLinkIncidentToRequest(options: {
  requestId: string;
  incidentId: string;
  context: ActionContext;
}): Promise<RequestTreatmentResult> {
  const request = await loadRequestOrThrow(options.requestId);
  assertRequestTreatable(request);

  const incidentId = options.incidentId.trim();
  if (!incidentId) {
    throw new ActionError("VALIDATION_ERROR", "Incident id is required.");
  }

  const result = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestLinkIncidentLeaseKey(request.id, incidentId),
    actorProfileId: options.context.userId,
    entityType: "incident",
    recoverExisting: async () => {
      const freshReq = await loadRequestOrThrow(request.id);
      const child = await IncidentService.getIncident(incidentId);
      if (!child) return null;
      if (
        child.sourceRequestId === request.id &&
        (freshReq.incidentIds ?? []).includes(incidentId)
      ) {
        return { entityId: child.id, value: child };
      }
      return null;
    },
    loadByEntityId: async (entityId) => {
      const row = await IncidentService.getIncident(entityId);
      if (!row) return null;
      return { entityId: row.id, value: row };
    },
    create: async () => {
      const child = await IncidentService.getIncident(incidentId);
      if (!child) {
        throw new ActionError(
          "VALIDATION_ERROR",
          `Incident ${incidentId} not found.`
        );
      }

      const linkState = assertChildLinkable(child.sourceRequestId, request.id, child.id);
      if (linkState === "linkable") {
        await IncidentService.updateIncident(child.id, {
          sourceRequestId: request.id,
          updatedByUserId: options.context.userId,
        });
      }

      const freshReq = await loadRequestOrThrow(request.id);
      if (!(freshReq.incidentIds ?? []).includes(child.id)) {
        try {
          await appendIncidentLink(freshReq, child.id, options.context.userId);
        } catch (error) {
          if (linkState === "linkable") {
            await compensateClearIncidentSource(child.id, request.id);
          }
          throw error instanceof ActionError
            ? error
            : new ActionError(
                "INTERNAL_ERROR",
                `Failed to append ${child.id} on Request after setting sourceRequestId.`,
                { cause: error }
              );
        }
      }

      const linked = await IncidentService.getIncident(child.id);
      if (!linked) {
        throw new ActionError(
          "INTERNAL_ERROR",
          `Incident ${child.id} missing after link.`
        );
      }
      return { entityId: linked.id, value: linked };
    },
  });

  const updated = await loadRequestOrThrow(request.id);

  try {
    await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_REQUEST_INCIDENT_LINKED,
      entityType: "request",
      entityId: updated.id,
      data: {
        requestId: updated.id,
        incidentId: result.id,
        actor: options.context.userId,
      },
    });
  } catch {
    // non-blocking
  }

  return { request: updated, incident: result };
}

export async function orchestrateResolveRequest(options: {
  requestId: string;
  context: ActionContext;
}): Promise<RequestRecord> {
  const request = await loadRequestOrThrow(options.requestId);
  assertRequestResolvable(request);

  const updated = await RequestService.updateRequest({
    id: request.id,
    status: "resolved",
    updatedByUserId: options.context.userId,
  });

  try {
    await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_REQUEST_RESOLVED,
      entityType: "request",
      entityId: updated.id,
      data: {
        requestId: updated.id,
        previousStatus: request.status,
        actor: options.context.userId,
      },
    });
  } catch {
    // non-blocking
  }

  return updated;
}

export async function orchestrateCancelRequest(options: {
  requestId: string;
  context: ActionContext;
}): Promise<RequestRecord> {
  const request = await loadRequestOrThrow(options.requestId);
  assertRequestCancellable(request);

  const updated = await RequestService.deactivateRequest(request.id);

  try {
    await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_REQUEST_CANCELLED,
      entityType: "request",
      entityId: updated.id,
      data: {
        requestId: updated.id,
        previousStatus: request.status,
        maintenanceIds: updated.maintenanceIds,
        incidentIds: updated.incidentIds,
        actor: options.context.userId,
      },
    });
  } catch {
    // non-blocking
  }

  return updated;
}

export async function orchestrateStartRequestReview(options: {
  requestId: string;
  context: ActionContext;
}): Promise<RequestRecord> {
  const request = await loadRequestOrThrow(options.requestId);
  assertRequestTreatable(request);

  if (request.status !== "submitted") {
    return request;
  }

  const updated = await RequestService.updateRequest({
    id: request.id,
    status: "under_review",
    updatedByUserId: options.context.userId,
  });

  try {
    await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_REQUEST_REVIEW_STARTED,
      entityType: "request",
      entityId: updated.id,
      data: {
        requestId: updated.id,
        actor: options.context.userId,
      },
    });
  } catch {
    // non-blocking
  }

  return updated;
}

export async function loadRequestTreatmentDetail(
  requestId: string
): Promise<RequestTreatmentDetail> {
  const request = await loadRequestOrThrow(requestId);

  const maintenance = (
    await Promise.all(
      (request.maintenanceIds ?? []).map((id) =>
        MaintenanceService.getMaintenance(id)
      )
    )
  ).filter((row): row is Maintenance => row != null);

  const incidents = (
    await Promise.all(
      (request.incidentIds ?? []).map((id) => IncidentService.getIncident(id))
    )
  ).filter((row): row is Incident => row != null);

  const derivedWorkOrders: DerivedWorkOrderLink[] = [];
  const seen = new Set<string>();

  for (const mnt of maintenance) {
    for (const woId of mnt.workOrderIds ?? []) {
      if (seen.has(woId)) continue;
      const workOrder = await WorkOrderService.getWorkOrder(woId);
      if (!workOrder) continue;
      seen.add(woId);
      derivedWorkOrders.push({
        workOrder,
        via: "maintenance",
        viaId: mnt.id,
      });
    }
  }

  for (const inc of incidents) {
    for (const woId of inc.workOrderIds ?? []) {
      if (seen.has(woId)) continue;
      const workOrder = await WorkOrderService.getWorkOrder(woId);
      if (!workOrder) continue;
      seen.add(woId);
      derivedWorkOrders.push({
        workOrder,
        via: "incident",
        viaId: inc.id,
      });
    }
  }

  return { request, maintenance, incidents, derivedWorkOrders };
}

export async function searchLinkableMaintenance(options: {
  requestId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: LinkableSearchHit[]; total: number; page: number }> {
  const request = await loadRequestOrThrow(options.requestId);
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 8;

  // Facility-scoped list with search; keep page modest — link UI pages locally.
  const listed = await MaintenanceService.listMaintenance({
    page: 1,
    pageSize: 50,
    search: options.search,
    facilityId: request.facilityId,
    status: "all",
  });

  const linkable = listed.data.filter((row) => {
    const src = row.sourceRequestId?.trim();
    if (!src) return true;
    return src === request.id;
  });

  const start = (page - 1) * pageSize;
  const slice = linkable.slice(start, start + pageSize);

  return {
    data: slice.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      facilityId: row.facilityId,
      date: row.reportedAt || row.createdAt,
      sourceRequestId: row.sourceRequestId,
    })),
    total: linkable.length,
    page,
  };
}

export async function searchLinkableIncidents(options: {
  requestId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: LinkableSearchHit[]; total: number; page: number }> {
  const request = await loadRequestOrThrow(options.requestId);
  const page = options.page ?? 1;
  const pageSize = options.pageSize ?? 8;

  // Facility-scoped list with search; keep page modest — link UI pages locally.
  const listed = await IncidentService.listIncidents({
    page: 1,
    pageSize: 50,
    search: options.search,
    facilityId: request.facilityId,
    status: "all",
  });

  const linkable = listed.data.filter((row) => {
    const src = row.sourceRequestId?.trim();
    if (!src) return true;
    return src === request.id;
  });

  const start = (page - 1) * pageSize;
  const slice = linkable.slice(start, start + pageSize);

  return {
    data: slice.map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      facilityId: row.facilityId,
      date: row.reportedAt || row.createdAt,
      sourceRequestId: row.sourceRequestId,
    })),
    total: linkable.length,
    page,
  };
}
