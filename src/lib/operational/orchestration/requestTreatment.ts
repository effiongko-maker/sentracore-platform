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
import {
  assertRequestCancellable,
  assertRequestResolvable,
  assertRequestTreatable,
} from "@/modules/requests/treatment/assertStatus";
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

function mapLinkAppsScriptError(error: unknown): never {
  const message =
    error instanceof Error && error.message.trim()
      ? error.message.trim()
      : "linkTreatment failed";
  if (
    /cannot receive treatment/i.test(message) ||
    /not found/i.test(message) ||
    /Facility mismatch/i.test(message) ||
    /already linked/i.test(message) ||
    /childId is required/i.test(message) ||
    /requestId is required/i.test(message)
  ) {
    throw new ActionError("VALIDATION_ERROR", message, { cause: error });
  }
  throw new ActionError("INTERNAL_ERROR", message, { cause: error });
}

export async function orchestrateCreateMaintenanceFromRequest(options: {
  requestId: string;
  input: CreateMaintenanceInput;
  idempotencyKey: string;
  context: ActionContext;
}): Promise<RequestTreatmentResult> {
  let appsScriptCalls = 0;

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
    sourceRequestId: options.requestId,
    createdByUserId: options.context.userId,
    updatedByUserId: options.context.userId,
  };

  type Bundle = {
    request: RequestRecord;
    maintenance: Maintenance;
    idempotent: boolean;
  };

  const invokeCreateTreatment = async (): Promise<Bundle> => {
    appsScriptCalls += 1;
    try {
      const result = await RequestService.createTreatment({
        kind: "maintenance",
        requestId: options.requestId,
        childInput: writeInput,
        idempotencyKey,
        actorUserId: options.context.userId,
      });
      if (!result.maintenance) {
        throw new ActionError(
          "INTERNAL_ERROR",
          "createTreatment did not return maintenance."
        );
      }
      return {
        request: result.request,
        maintenance: result.maintenance,
        idempotent: result.idempotent,
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "createTreatment failed";
      if (/cannot receive treatment/i.test(message) || /not found/i.test(message) || /Facility mismatch/i.test(message) || /idempotencyKey is required/i.test(message)) {
        throw new ActionError("VALIDATION_ERROR", message, { cause: error });
      }
      throw new ActionError("INTERNAL_ERROR", message, { cause: error });
    }
  };

  const bundle = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestCreateMaintenanceLeaseKey(options.requestId, idempotencyKey),
    actorProfileId: options.context.userId,
    entityType: "maintenance",
    recoverExisting: async () => null,
    loadByEntityId: async () => {
      const recovered = await invokeCreateTreatment();
      return { entityId: recovered.maintenance.id, value: recovered };
    },
    create: async () => {
      const created = await invokeCreateTreatment();
      return { entityId: created.maintenance.id, value: created };
    },
  });

  if (!bundle.idempotent) {
    try {
      const event = await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
        entityType: "maintenance_request",
        entityId: String(bundle.maintenance.id),
        data: withIntakeMetadata(
          maintenanceEventData(bundle.maintenance, {
            actor: options.context.userId,
            transitionSource: "specialised_action",
          }),
          "staff",
          options.requestId
        ),
      });
      void MaintenanceService.updateMaintenance(bundle.maintenance.id, {
        operationalEventId: event.id,
      }).catch((patchError) => {
        console.error("[requestTreatment] maintenance event id patch failed", {
          maintenanceId: bundle.maintenance.id,
          error:
            patchError instanceof Error
              ? patchError.message
              : String(patchError),
        });
      });
    } catch (eventError) {
      console.error("[requestTreatment] maintenance event failed", {
        maintenanceId: bundle.maintenance.id,
        error:
          eventError instanceof Error ? eventError.message : String(eventError),
      });
    }

    try {
      await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_REQUEST_MAINTENANCE_CREATED,
        entityType: "request",
        entityId: bundle.request.id,
        data: {
          requestId: bundle.request.id,
          maintenanceId: bundle.maintenance.id,
          actor: options.context.userId,
        },
      });
    } catch (eventError) {
      console.error("[orchestrateCreateMaintenanceFromRequest] event failed", {
        error:
          eventError instanceof Error ? eventError.message : String(eventError),
      });
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[create-treatment.write.timing] kind=maintenance appsScriptCalls=${appsScriptCalls} requestId=${bundle.request.id} childId=${bundle.maintenance.id} idempotent=${bundle.idempotent ? 1 : 0}`
    );
  }

  return {
    request: bundle.request,
    maintenance: bundle.maintenance,
    _appsScriptCalls: appsScriptCalls,
  };
}

export async function orchestrateCreateIncidentFromRequest(options: {
  requestId: string;
  input: CreateIncidentInput;
  idempotencyKey: string;
  context: ActionContext;
}): Promise<RequestTreatmentResult> {
  let appsScriptCalls = 0;

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
    sourceRequestId: options.requestId,
    createdByUserId: options.context.userId,
    updatedByUserId: options.context.userId,
  };

  type Bundle = {
    request: RequestRecord;
    incident: Incident;
    idempotent: boolean;
  };

  const invokeCreateTreatment = async (): Promise<Bundle> => {
    appsScriptCalls += 1;
    try {
      const result = await RequestService.createTreatment({
        kind: "incident",
        requestId: options.requestId,
        childInput: writeInput,
        idempotencyKey,
        actorUserId: options.context.userId,
      });
      if (!result.incident) {
        throw new ActionError(
          "INTERNAL_ERROR",
          "createTreatment did not return incident."
        );
      }
      return {
        request: result.request,
        incident: result.incident,
        idempotent: result.idempotent,
      };
    } catch (error) {
      const message =
        error instanceof Error && error.message.trim()
          ? error.message.trim()
          : "createTreatment failed";
      if (/cannot receive treatment/i.test(message) || /not found/i.test(message) || /Facility mismatch/i.test(message) || /idempotencyKey is required/i.test(message)) {
        throw new ActionError("VALIDATION_ERROR", message, { cause: error });
      }
      throw new ActionError("INTERNAL_ERROR", message, { cause: error });
    }
  };

  const bundle = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestCreateIncidentLeaseKey(options.requestId, idempotencyKey),
    actorProfileId: options.context.userId,
    entityType: "incident",
    recoverExisting: async () => null,
    loadByEntityId: async () => {
      const recovered = await invokeCreateTreatment();
      return { entityId: recovered.incident.id, value: recovered };
    },
    create: async () => {
      const created = await invokeCreateTreatment();
      return { entityId: created.incident.id, value: created };
    },
  });

  if (!bundle.idempotent) {
    try {
      const event = await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
        entityType: "incident",
        entityId: bundle.incident.id,
        data: withIntakeMetadata(
          incidentEventData(bundle.incident, {
            actor: options.context.userId,
            transitionSource: "specialised_action",
          }),
          "staff",
          options.requestId
        ),
      });
      void IncidentService.updateIncident(bundle.incident.id, {
        operationalEventId: event.id,
      }).catch((patchError) => {
        console.error("[requestTreatment] incident event id patch failed", {
          incidentId: bundle.incident.id,
          error:
            patchError instanceof Error
              ? patchError.message
              : String(patchError),
        });
      });
    } catch (eventError) {
      console.error("[requestTreatment] incident event failed", {
        incidentId: bundle.incident.id,
        error:
          eventError instanceof Error ? eventError.message : String(eventError),
      });
    }

    try {
      await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_REQUEST_INCIDENT_CREATED,
        entityType: "request",
        entityId: bundle.request.id,
        data: {
          requestId: bundle.request.id,
          incidentId: bundle.incident.id,
          actor: options.context.userId,
        },
      });
    } catch (eventError) {
      console.error("[orchestrateCreateIncidentFromRequest] event failed", {
        error:
          eventError instanceof Error ? eventError.message : String(eventError),
      });
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[create-treatment.write.timing] kind=incident appsScriptCalls=${appsScriptCalls} requestId=${bundle.request.id} childId=${bundle.incident.id} idempotent=${bundle.idempotent ? 1 : 0}`
    );
  }

  return {
    request: bundle.request,
    incident: bundle.incident,
    _appsScriptCalls: appsScriptCalls,
  };
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

  type Bundle = {
    request: RequestRecord;
    maintenance: Maintenance;
    idempotent: boolean;
  };

  const invokeLinkTreatment = async (): Promise<Bundle> => {
    appsScriptCalls += 1;
    try {
      const result = await RequestService.linkTreatment({
        kind: "maintenance",
        requestId: options.requestId,
        childId: maintenanceId,
        actorUserId: options.context.userId,
      });
      if (!result.maintenance) {
        throw new ActionError(
          "INTERNAL_ERROR",
          "linkTreatment did not return maintenance."
        );
      }
      return {
        request: result.request,
        maintenance: result.maintenance,
        idempotent: result.idempotent,
      };
    } catch (error) {
      if (error instanceof ActionError) throw error;
      mapLinkAppsScriptError(error);
    }
  };

  const bundle = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestLinkMaintenanceLeaseKey(
      options.requestId,
      maintenanceId
    ),
    actorProfileId: options.context.userId,
    entityType: "maintenance",
    recoverExisting: async () => null,
    loadByEntityId: async () => {
      const recovered = await invokeLinkTreatment();
      return { entityId: recovered.maintenance.id, value: recovered };
    },
    create: async () => {
      const created = await invokeLinkTreatment();
      return { entityId: created.maintenance.id, value: created };
    },
  });

  if (!bundle.idempotent) {
    try {
      await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_REQUEST_MAINTENANCE_LINKED,
        entityType: "request",
        entityId: bundle.request.id,
        data: {
          requestId: bundle.request.id,
          maintenanceId: bundle.maintenance.id,
          actor: options.context.userId,
        },
      });
    } catch {
      // non-blocking — Supabase, not Apps Script
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[link-treatment.write.timing] kind=maintenance appsScriptCalls=${appsScriptCalls} requestId=${bundle.request.id} childId=${bundle.maintenance.id} idempotent=${bundle.idempotent ? 1 : 0}`
    );
  }

  return {
    request: bundle.request,
    maintenance: bundle.maintenance,
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

  type Bundle = {
    request: RequestRecord;
    incident: Incident;
    idempotent: boolean;
  };

  const invokeLinkTreatment = async (): Promise<Bundle> => {
    appsScriptCalls += 1;
    try {
      const result = await RequestService.linkTreatment({
        kind: "incident",
        requestId: options.requestId,
        childId: incidentId,
        actorUserId: options.context.userId,
      });
      if (!result.incident) {
        throw new ActionError(
          "INTERNAL_ERROR",
          "linkTreatment did not return incident."
        );
      }
      return {
        request: result.request,
        incident: result.incident,
        idempotent: result.idempotent,
      };
    } catch (error) {
      if (error instanceof ActionError) throw error;
      mapLinkAppsScriptError(error);
    }
  };

  const bundle = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestLinkIncidentLeaseKey(options.requestId, incidentId),
    actorProfileId: options.context.userId,
    entityType: "incident",
    recoverExisting: async () => null,
    loadByEntityId: async () => {
      const recovered = await invokeLinkTreatment();
      return { entityId: recovered.incident.id, value: recovered };
    },
    create: async () => {
      const created = await invokeLinkTreatment();
      return { entityId: created.incident.id, value: created };
    },
  });

  if (!bundle.idempotent) {
    try {
      await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_REQUEST_INCIDENT_LINKED,
        entityType: "request",
        entityId: bundle.request.id,
        data: {
          requestId: bundle.request.id,
          incidentId: bundle.incident.id,
          actor: options.context.userId,
        },
      });
    } catch {
      // non-blocking
    }
  }

  if (process.env.NODE_ENV !== "production") {
    console.info(
      `[link-treatment.write.timing] kind=incident appsScriptCalls=${appsScriptCalls} requestId=${bundle.request.id} childId=${bundle.incident.id} idempotent=${bundle.idempotent ? 1 : 0}`
    );
  }

  return {
    request: bundle.request,
    incident: bundle.incident,
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
