import { emitActionEvent, type ActionContext } from "@/lib/actions";
import { ActionError } from "@/lib/actions/errors";
import { OperationalEventTypes } from "@/lib/events/taxonomy";
import { assertNewIncidentCreateAllowed } from "@/lib/operational/work/incidentWriteFreeze";
import {
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
import { IncidentServerAccess } from "@/modules/incidents/server/IncidentServerAccess";
import { MaintenanceServerAccess as MaintenanceService } from "@/modules/maintenance/server/MaintenanceServerAccess";
import { RequestServerAccess } from "@/modules/requests/server/RequestServerAccess";
import { isRequestTerminal } from "@/modules/requests/treatment/status";
import { WorkInstructionServerAccess as WorkOrderService } from "@/modules/work-orders/server/WorkInstructionServerAccess";
import {
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
  const request = await RequestServerAccess.getRequest(requestId);
  if (!request) {
    throw new ActionError(
      "VALIDATION_ERROR",
      `Request ${requestId} not found.`
    );
  }
  return request;
}

/** Request entity identity for events: the Supabase UUID (code travels in data). */
function requestEntityId(request: RequestRecord): string {
  return request.requestUuid ?? request.id;
}

/**
 * First successful treatment moves an open Request to `being_treated`.
 * Terminal Requests are never reopened. Idempotent — safe to repeat on
 * lease recovery so an interrupted transition is repaired, not duplicated.
 */
async function advanceRequestAfterTreatment(
  requestId: string
): Promise<RequestRecord> {
  const request = await loadRequestOrThrow(requestId);
  if (isRequestTerminal(request.status) || request.status === "being_treated") {
    return request;
  }
  const { request: updated } = await RequestServerAccess.transitionStatus(
    request.id,
    "being_treated"
  );
  return updated;
}

function sameIdentity(a: string | undefined, b: string | undefined): boolean {
  return !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();
}

function assertFacilityMatch(
  request: RequestRecord,
  childFacilityId: string | undefined,
  requestFacilityCode?: string | null
): void {
  const child = childFacilityId?.trim();
  if (!child) {
    throw new ActionError(
      "VALIDATION_ERROR",
      "Child facilityId is required for treatment."
    );
  }
  if (
    sameIdentity(child, request.facilityId) ||
    sameIdentity(child, requestFacilityCode ?? undefined)
  ) {
    return;
  }
  throw new ActionError(
    "VALIDATION_ERROR",
    `Facility mismatch: child facilityId ${child} does not match request facilityId ${request.facilityId}.`
  );
}

export async function orchestrateCreateMaintenanceFromRequest(options: {
  requestId: string;
  input: CreateMaintenanceInput;
  idempotencyKey: string;
  context: ActionContext;
}): Promise<RequestTreatmentResult> {
  const idempotencyKey = options.idempotencyKey.trim();
  if (!idempotencyKey) {
    throw new ActionError(
      "VALIDATION_ERROR",
      "Idempotency key is required."
    );
  }

  type Bundle = {
    request: RequestRecord;
    maintenance: Maintenance;
    idempotent: boolean;
  };

  /**
   * Phase 2C: Request and Work are both Supabase. Provenance is the Work row's
   * source_request_id (written atomically with the Work insert) — the Request
   * stores no child ids. The Request then advances to `being_treated`.
   */
  const invokeCreateTreatment = async (): Promise<Bundle> => {
    const request = await loadRequestOrThrow(options.requestId);
    assertRequestTreatable(request);
    assertFacilityMatch(
      request,
      options.input.facilityId,
      await RequestServerAccess.facilityCode(request)
    );

    // Lease recovers by entity id; duplicate create within lease is prevented.
    const maintenance = await MaintenanceService.createMaintenance({
      ...options.input,
      source: options.input.source ?? "request",
      sourceRequestId: request.id,
      createdByUserId: options.context.userId,
      updatedByUserId: options.context.userId,
    });
    const updatedRequest = await advanceRequestAfterTreatment(request.id);
    return { request: updatedRequest, maintenance, idempotent: false };
  };

  const bundle = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestCreateMaintenanceLeaseKey(options.requestId, idempotencyKey),
    actorProfileId: options.context.userId,
    entityType: "maintenance",
    recoverExisting: async () => null,
    loadByEntityId: async (entityId) => {
      const maintenance = await MaintenanceService.getMaintenance(entityId);
      if (!maintenance) return null;
      // Repairs an interrupted status transition; never creates a second Work.
      const request = await advanceRequestAfterTreatment(options.requestId);
      return {
        entityId: maintenance.id,
        value: { request, maintenance, idempotent: true },
      };
    },
    create: async () => {
      const created = await invokeCreateTreatment();
      return {
        entityId: created.maintenance.id,
        value: { ...created, idempotent: false },
      };
    },
  });

  if (!bundle.idempotent) {
    try {
      const event = await emitActionEvent(options.context, {
        eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
        entityType: "maintenance_request",
        entityId: bundle.maintenance.workUuid ?? String(bundle.maintenance.id),
        data: withIntakeMetadata(
          maintenanceEventData(bundle.maintenance, {
            actor: options.context.userId,
            transitionSource: "specialised_action",
          }),
          "staff",
          bundle.request.id
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
        entityId: requestEntityId(bundle.request),
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

  return {
    request: bundle.request,
    maintenance: bundle.maintenance,
    _appsScriptCalls: 0,
  };
}

/**
 * Phase 15 canonical alias: Request → Treat → Work (Maintenance backing).
 * Prefer this name in new call sites; persistence unchanged.
 */
export const orchestrateCreateWorkFromRequest =
  orchestrateCreateMaintenanceFromRequest;

/**
 * FROZEN (Phase 18): new FM Request → Incident creation is not allowed.
 * Phase 15 canonical path is orchestrateCreateWorkFromRequest. The former
 * Apps Script createTreatment body is intentionally removed — it wrote the
 * Sheet Request, which is no longer authoritative.
 */
export async function orchestrateCreateIncidentFromRequest(options: {
  requestId: string;
  input: CreateIncidentInput;
  idempotencyKey: string;
  context: ActionContext;
}): Promise<RequestTreatmentResult> {
  void options;
  assertNewIncidentCreateAllowed("orchestrateCreateIncidentFromRequest");
  throw new ActionError("VALIDATION_ERROR", "Incident creation is frozen.");
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

  type Bundle = {
    request: RequestRecord;
    maintenance: Maintenance;
    idempotent: boolean;
  };

  /**
   * Phase 2C: linking sets Work.source_request_id (FK). Ownership conflict and
   * facility rules are preserved from the retired Apps Script linkTreatment.
   */
  const invokeLinkTreatment = async (): Promise<Bundle> => {
    const request = await loadRequestOrThrow(options.requestId);
    assertRequestTreatable(request);
    const maintenance = await MaintenanceService.getMaintenance(maintenanceId);
    if (!maintenance) {
      throw new ActionError(
        "VALIDATION_ERROR",
        `Work ${maintenanceId} not found.`
      );
    }
    assertFacilityMatch(
      request,
      maintenance.facilityId,
      await RequestServerAccess.facilityCode(request)
    );

    const owner = maintenance.sourceRequestId?.trim();
    if (owner && !sameIdentity(owner, request.id)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        `${maintenance.id} is already linked to ${owner} and cannot be reassigned.`
      );
    }
    if (owner) {
      const advanced = await advanceRequestAfterTreatment(request.id);
      return { request: advanced, maintenance, idempotent: true };
    }

    const linked = await MaintenanceService.updateMaintenance(maintenance.id, {
      sourceRequestId: request.id,
    });
    const advanced = await advanceRequestAfterTreatment(request.id);
    return {
      request: advanced,
      maintenance: { ...maintenance, ...linked, sourceRequestId: request.id },
      idempotent: false,
    };
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
    loadByEntityId: async (entityId) => {
      const maintenance = await MaintenanceService.getMaintenance(entityId);
      if (!maintenance) return null;
      const request = await advanceRequestAfterTreatment(options.requestId);
      return {
        entityId: maintenance.id,
        value: { request, maintenance, idempotent: true },
      };
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
        entityId: requestEntityId(bundle.request),
        data: {
          requestId: bundle.request.id,
          maintenanceId: bundle.maintenance.id,
          actor: options.context.userId,
        },
      });
    } catch {
      // non-blocking
    }
  }

  return {
    request: bundle.request,
    maintenance: bundle.maintenance,
    _appsScriptCalls: 0,
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

  type Bundle = {
    request: RequestRecord;
    incident: Incident;
    idempotent: boolean;
  };

  /**
   * Phase 2D: Request and Incident are both Supabase. The link is the
   * Incident row's source_request_id (tenant-safe FK) — one write, no bridge
   * table, no Sheet mirror. Ownership conflict and facility rules are preserved.
   */
  const invokeLinkTreatment = async (): Promise<Bundle> => {
    const request = await loadRequestOrThrow(options.requestId);
    assertRequestTreatable(request);

    const incident = await IncidentServerAccess.getIncident(incidentId);
    if (!incident) {
      throw new ActionError("VALIDATION_ERROR", `Incident ${incidentId} not found.`);
    }
    assertFacilityMatch(
      request,
      incident.facilityId,
      await RequestServerAccess.facilityCode(request)
    );

    const owner = incident.sourceRequestId?.trim();
    if (owner && !sameIdentity(owner, request.id)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        `${incident.id} is already linked to ${owner} and cannot be reassigned.`
      );
    }
    if (owner) {
      const advanced = await advanceRequestAfterTreatment(request.id);
      return { request: advanced, incident, idempotent: true };
    }

    const linked = await IncidentServerAccess.updateIncident(incident.id, {
      sourceRequestId: request.id,
    });
    const advanced = await advanceRequestAfterTreatment(request.id);
    return { request: advanced, incident: linked, idempotent: false };
  };

  const bundle = await runExclusiveOperationalAction({
    organisationId: options.context.organisation.id,
    scopeKey: requestLinkIncidentLeaseKey(options.requestId, incidentId),
    actorProfileId: options.context.userId,
    entityType: "incident",
    recoverExisting: async () => null,
    loadByEntityId: async (entityId) => {
      const incident = await IncidentServerAccess.getIncident(entityId);
      if (!incident) return null;
      // Repairs an interrupted status transition; never links twice.
      const request = await advanceRequestAfterTreatment(options.requestId);
      return {
        entityId: incident.id,
        value: { request, incident, idempotent: true },
      };
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
        entityId: requestEntityId(bundle.request),
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

  return {
    request: bundle.request,
    incident: bundle.incident,
    _appsScriptCalls: 0,
  };
}

export async function orchestrateResolveRequest(options: {
  requestId: string;
  context: ActionContext;
}): Promise<RequestRecord> {
  const request = await loadRequestOrThrow(options.requestId);
  assertRequestResolvable(request);

  const { request: updated, previousStatus } =
    await RequestServerAccess.transitionStatus(request.id, "resolved");

  try {
    await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_REQUEST_RESOLVED,
      entityType: "request",
      entityId: requestEntityId(updated),
      data: {
        requestId: updated.id,
        previousStatus,
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

  const updated = await RequestServerAccess.cancelRequest(request.id);

  try {
    await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_REQUEST_CANCELLED,
      entityType: "request",
      entityId: requestEntityId(updated),
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

  const { request: updated } = await RequestServerAccess.transitionStatus(
    request.id,
    "under_review"
  );

  try {
    await emitActionEvent(options.context, {
      eventType: OperationalEventTypes.FACILITY_REQUEST_REVIEW_STARTED,
      entityType: "request",
      entityId: requestEntityId(updated),
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
      (request.incidentIds ?? []).map((id) => IncidentServerAccess.getIncident(id))
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

  const listed = await IncidentServerAccess.listIncidents({
    page: 1,
    pageSize,
    facilityId: request.facilityId,
    status: "all",
  });

  const linkable = listed.data
    .filter((row) => row.status !== "cancelled" && row.status !== "closed")
    .filter((row) => {
      const src = row.sourceRequestId?.trim();
      if (!src) return true;
      return sameIdentity(src, request.id);
    })
    .map((row) => ({
      id: row.id,
      title: row.title,
      status: row.status,
      facilityId: row.facilityId,
      date: row.reportedAt || row.createdAt,
      sourceRequestId: row.sourceRequestId,
    }));

  return { data: linkable, total: linkable.length, page: 1 };
}
