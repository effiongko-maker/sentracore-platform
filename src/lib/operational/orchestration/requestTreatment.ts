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
export type { RequestTreatmentResult } from "@/modules/requests/treatment/resultTypes";
export type {
  DerivedWorkOrderLink,
  RequestTreatmentDetail,
} from "@/modules/requests/treatment/detailTypes";
import type { RequestTreatmentResult } from "@/modules/requests/treatment/resultTypes";

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
  const maintenanceId = options.maintenanceId.trim();
  if (!maintenanceId) {
    throw new ActionError("VALIDATION_ERROR", "Maintenance id is required.");
  }

  let appsScriptCalls = 0;
  const getRequest = async (id: string) => {
    appsScriptCalls += 1;
    return loadRequestOrThrow(id);
  };
  const getChild = async (id: string) => {
    appsScriptCalls += 1;
    return MaintenanceService.getMaintenance(id);
  };
  const writeChild = async (
    id: string,
    input: Parameters<typeof MaintenanceService.updateMaintenance>[1]
  ) => {
    appsScriptCalls += 1;
    return MaintenanceService.updateMaintenance(id, input);
  };
  const writeRequestAppend = async (
    request: RequestRecord,
    childId: string,
    actorUserId: string
  ) => {
    appsScriptCalls += 1;
    return appendMaintenanceLink(request, childId, actorUserId);
  };

  // Independent reads — one RTT. Establishes treatability + early idempotent/conflict.
  const [request, primedChild] = await Promise.all([
    getRequest(options.requestId),
    getChild(maintenanceId),
  ]);
  assertRequestTreatable(request);
  if (!primedChild) {
    throw new ActionError(
      "VALIDATION_ERROR",
      `Maintenance ${maintenanceId} not found.`
    );
  }

  // Early conflict (authoritative child from this action — not client catalogue).
  assertChildLinkable(
    primedChild.sourceRequestId,
    request.id,
    primedChild.id
  );

  if (
    primedChild.sourceRequestId === request.id &&
    (request.maintenanceIds ?? []).includes(maintenanceId)
  ) {
    return {
      request,
      maintenance: primedChild,
      _appsScriptCalls: appsScriptCalls,
    };
  }

  /** Request row returned by reverse-link write — avoids a final getById. */
  let linkedRequest: RequestRecord | null = null;
  /** recoverExisting invocation count inside the lease helper. */
  let recoverPass = 0;

  const result = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestLinkMaintenanceLeaseKey(request.id, maintenanceId),
    actorProfileId: options.context.userId,
    entityType: "maintenance",
    recoverExisting: async () => {
      recoverPass += 1;

      // Pass 1 (pre-lease): reuse primed reads — 0 AS when not already linked to us.
      if (recoverPass === 1) {
        if (primedChild.sourceRequestId !== request.id) return null;
        const freshReq = await getRequest(request.id);
        if ((freshReq.maintenanceIds ?? []).includes(maintenanceId)) {
          linkedRequest = freshReq;
          return { entityId: primedChild.id, value: primedChild };
        }
        return null;
      }

      // Pass 2 (post-claim on happy path): create() does the authoritative get.
      // Orphan/idempotent repair is handled there; skipping avoids a duplicate get.
      if (recoverPass === 2) {
        return null;
      }

      // Pass 3+ (wait / takeover / contention): full Sheets recover.
      const child = await getChild(maintenanceId);
      if (!child) return null;
      if (child.sourceRequestId !== request.id) return null;
      const freshReq = await getRequest(request.id);
      if ((freshReq.maintenanceIds ?? []).includes(maintenanceId)) {
        linkedRequest = freshReq;
        return { entityId: child.id, value: child };
      }
      return null;
    },
    loadByEntityId: async (entityId) => {
      const row = await getChild(entityId);
      if (!row) return null;
      return { entityId: row.id, value: row };
    },
    create: async () => {
      // Authoritative re-read immediately before mutation (conflict protection).
      const child = await getChild(maintenanceId);
      if (!child) {
        throw new ActionError(
          "VALIDATION_ERROR",
          `Maintenance ${maintenanceId} not found.`
        );
      }

      const linkState = assertChildLinkable(
        child.sourceRequestId,
        request.id,
        child.id
      );

      // Child.sourceRequestId first — update response is authoritative (no re-get).
      let linked = child;
      if (linkState === "linkable") {
        linked = await writeChild(child.id, {
          sourceRequestId: request.id,
          updatedByUserId: options.context.userId,
        });
      }

      // Fresh Request required before reverse-link (concurrent other links may append).
      const freshReq = await getRequest(request.id);
      if (!(freshReq.maintenanceIds ?? []).includes(child.id)) {
        try {
          linkedRequest = await writeRequestAppend(
            freshReq,
            child.id,
            options.context.userId
          );
        } catch (error) {
          if (linkState === "linkable") {
            appsScriptCalls += 1;
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
      } else {
        linkedRequest = freshReq;
      }

      return { entityId: linked.id, value: linked };
    },
  });

  const updated =
    linkedRequest ?? (await getRequest(request.id));

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
    // non-blocking — Supabase, not Apps Script
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[link-treatment.write.timing] kind=maintenance appsScriptCalls=${appsScriptCalls} requestId=${request.id} childId=${result.id}`
    );
  }

  return {
    request: updated,
    maintenance: result,
    _appsScriptCalls: appsScriptCalls,
  };
}

export async function orchestrateLinkIncidentToRequest(options: {
  requestId: string;
  incidentId: string;
  context: ActionContext;
}): Promise<RequestTreatmentResult> {
  const incidentId = options.incidentId.trim();
  if (!incidentId) {
    throw new ActionError("VALIDATION_ERROR", "Incident id is required.");
  }

  let appsScriptCalls = 0;
  const getRequest = async (id: string) => {
    appsScriptCalls += 1;
    return loadRequestOrThrow(id);
  };
  const getChild = async (id: string) => {
    appsScriptCalls += 1;
    return IncidentService.getIncident(id);
  };
  const writeChild = async (
    id: string,
    input: Parameters<typeof IncidentService.updateIncident>[1]
  ) => {
    appsScriptCalls += 1;
    return IncidentService.updateIncident(id, input);
  };
  const writeRequestAppend = async (
    request: RequestRecord,
    childId: string,
    actorUserId: string
  ) => {
    appsScriptCalls += 1;
    return appendIncidentLink(request, childId, actorUserId);
  };

  const [request, primedChild] = await Promise.all([
    getRequest(options.requestId),
    getChild(incidentId),
  ]);
  assertRequestTreatable(request);
  if (!primedChild) {
    throw new ActionError(
      "VALIDATION_ERROR",
      `Incident ${incidentId} not found.`
    );
  }

  assertChildLinkable(primedChild.sourceRequestId, request.id, primedChild.id);

  if (
    primedChild.sourceRequestId === request.id &&
    (request.incidentIds ?? []).includes(incidentId)
  ) {
    return {
      request,
      incident: primedChild,
      _appsScriptCalls: appsScriptCalls,
    };
  }

  let linkedRequest: RequestRecord | null = null;
  let recoverPass = 0;

  const result = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestLinkIncidentLeaseKey(request.id, incidentId),
    actorProfileId: options.context.userId,
    entityType: "incident",
    recoverExisting: async () => {
      recoverPass += 1;

      if (recoverPass === 1) {
        if (primedChild.sourceRequestId !== request.id) return null;
        const freshReq = await getRequest(request.id);
        if ((freshReq.incidentIds ?? []).includes(incidentId)) {
          linkedRequest = freshReq;
          return { entityId: primedChild.id, value: primedChild };
        }
        return null;
      }

      if (recoverPass === 2) {
        return null;
      }

      const child = await getChild(incidentId);
      if (!child) return null;
      if (child.sourceRequestId !== request.id) return null;
      const freshReq = await getRequest(request.id);
      if ((freshReq.incidentIds ?? []).includes(incidentId)) {
        linkedRequest = freshReq;
        return { entityId: child.id, value: child };
      }
      return null;
    },
    loadByEntityId: async (entityId) => {
      const row = await getChild(entityId);
      if (!row) return null;
      return { entityId: row.id, value: row };
    },
    create: async () => {
      const child = await getChild(incidentId);
      if (!child) {
        throw new ActionError(
          "VALIDATION_ERROR",
          `Incident ${incidentId} not found.`
        );
      }

      const linkState = assertChildLinkable(
        child.sourceRequestId,
        request.id,
        child.id
      );

      let linked = child;
      if (linkState === "linkable") {
        linked = await writeChild(child.id, {
          sourceRequestId: request.id,
          updatedByUserId: options.context.userId,
        });
      }

      const freshReq = await getRequest(request.id);
      if (!(freshReq.incidentIds ?? []).includes(child.id)) {
        try {
          linkedRequest = await writeRequestAppend(
            freshReq,
            child.id,
            options.context.userId
          );
        } catch (error) {
          if (linkState === "linkable") {
            appsScriptCalls += 1;
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
      } else {
        linkedRequest = freshReq;
      }

      return { entityId: linked.id, value: linked };
    },
  });

  const updated =
    linkedRequest ?? (await getRequest(request.id));

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

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[link-treatment.write.timing] kind=incident appsScriptCalls=${appsScriptCalls} requestId=${request.id} childId=${result.id}`
    );
  }

  return {
    request: updated,
    incident: result,
    _appsScriptCalls: appsScriptCalls,
  };
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

/**
 * Facility-scoped linkable catalogue for Request Treatment Link UI.
 * Search text is ignored here — the client filters locally after one fetch.
 * Authorization / ownership is re-checked on Link submit (not trust client).
 */
export async function searchLinkableMaintenance(options: {
  requestId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: LinkableSearchHit[]; total: number; page: number }> {
  const request = await loadRequestOrThrow(options.requestId);
  const pageSize = Math.min(Math.max(options.pageSize ?? 200, 1), 500);

  const listed = await MaintenanceService.listMaintenance({
    page: 1,
    pageSize,
    facilityId: request.facilityId,
    status: "all",
  });

  const linkable = listed.data
    .filter((row) => row.status !== "cancelled")
    .filter((row) => {
      const src = row.sourceRequestId?.trim();
      if (!src) return true;
      return src === request.id;
    })
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      facilityId: row.facilityId,
      date: row.reportedAt || row.createdAt,
      sourceRequestId: row.sourceRequestId,
    }));

  return {
    data: linkable,
    total: linkable.length,
    page: 1,
  };
}

export async function searchLinkableIncidents(options: {
  requestId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<{ data: LinkableSearchHit[]; total: number; page: number }> {
  const request = await loadRequestOrThrow(options.requestId);
  const pageSize = Math.min(Math.max(options.pageSize ?? 200, 1), 500);

  const listed = await IncidentService.listIncidents({
    page: 1,
    pageSize,
    facilityId: request.facilityId,
    status: "all",
  });

  const linkable = listed.data
    .filter(
      (row) => row.status !== "cancelled" && row.status !== "closed"
    )
    .filter((row) => {
      const src = row.sourceRequestId?.trim();
      if (!src) return true;
      return src === request.id;
    })
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      facilityId: row.facilityId,
      date: row.reportedAt || row.createdAt,
      sourceRequestId: row.sourceRequestId,
    }));

  return {
    data: linkable,
    total: linkable.length,
    page: 1,
  };
}
