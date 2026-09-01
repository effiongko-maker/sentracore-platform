"use server";

import { ActionError } from "@/lib/actions/errors";
import { executeAction, type ActionResult } from "@/lib/actions";
import {
  loadRequestTreatmentDetail,
  orchestrateCancelRequest,
  orchestrateCreateIncidentFromRequest,
  orchestrateCreateMaintenanceFromRequest,
  orchestrateLinkIncidentToRequest,
  orchestrateLinkMaintenanceToRequest,
  orchestrateResolveRequest,
  orchestrateStartRequestReview,
  searchLinkableIncidents,
  searchLinkableMaintenance,
  type LinkableSearchHit,
  type RequestTreatmentDetail,
  type RequestTreatmentResult,
} from "@/lib/operational/orchestration/requestTreatment";
import { assertNewIncidentCreateAllowed } from "@/lib/operational/work/incidentWriteFreeze";
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_SOURCES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
} from "@/modules/maintenance/constants";
import type { CreateMaintenanceInput } from "@/modules/maintenance/types";
import {
  applyWorkOrderRule as applyMaintenanceWorkOrderRule,
  optionalString as optionalMaintenanceString,
} from "@/modules/maintenance/utils";
import {
  INCIDENT_CHANNELS,
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
} from "@/modules/incidents/constants";
import type {
  CreateIncidentInput,
  IncidentChannel,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  IncidentType,
} from "@/modules/incidents/types";
import {
  applyWorkOrderRule as applyIncidentWorkOrderRule,
  optionalString as optionalIncidentString,
} from "@/modules/incidents/utils";
import type { RequestRecord } from "../types";

function isOneOf<T extends string>(
  value: string,
  allowed: readonly T[]
): value is T {
  return (allowed as readonly string[]).includes(value);
}

function toIsoOrThrow(value: string, label: string): string {
  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) {
    throw new ActionError("VALIDATION_ERROR", `${label} is invalid.`);
  }
  return new Date(ms).toISOString();
}

function toOptionalIso(value?: string, label?: string): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  const ms = Date.parse(trimmed);
  if (!Number.isFinite(ms)) {
    throw new ActionError(
      "VALIDATION_ERROR",
      `${label ?? "Date"} is invalid.`
    );
  }
  return new Date(ms).toISOString();
}

function validateMaintenanceInput(
  input: CreateMaintenanceInput
): CreateMaintenanceInput {
  const title = input.title?.trim() ?? "";
  const facilityId = input.facilityId?.trim() ?? "";
  if (!title) throw new ActionError("VALIDATION_ERROR", "Title is required.");
  if (!facilityId) {
    throw new ActionError("VALIDATION_ERROR", "Facility is required.");
  }
  if (!input.reportedAt) {
    throw new ActionError("VALIDATION_ERROR", "Reported at is required.");
  }
  if (!isOneOf(String(input.type), MAINTENANCE_TYPES)) {
    throw new ActionError("VALIDATION_ERROR", "Maintenance type is invalid.");
  }
  if (!isOneOf(String(input.source), MAINTENANCE_SOURCES)) {
    throw new ActionError("VALIDATION_ERROR", "Maintenance source is invalid.");
  }
  if (!isOneOf(String(input.priority), MAINTENANCE_PRIORITIES)) {
    throw new ActionError("VALIDATION_ERROR", "Priority is invalid.");
  }
  if (!isOneOf(String(input.status), MAINTENANCE_STATUSES)) {
    throw new ActionError("VALIDATION_ERROR", "Status is invalid.");
  }

  const description = optionalMaintenanceString(input.description) || title;

  return applyMaintenanceWorkOrderRule({
    ...input,
    title,
    description,
    facilityId,
    categoryId: optionalMaintenanceString(input.categoryId),
    department: optionalMaintenanceString(input.department),
    assetId: optionalMaintenanceString(input.assetId),
    reportedByUserId: optionalMaintenanceString(input.reportedByUserId),
    assignedToUserId: optionalMaintenanceString(input.assignedToUserId),
    assignedGroupId: optionalMaintenanceString(input.assignedGroupId),
    eventId: optionalMaintenanceString(input.eventId),
    incidentId: optionalMaintenanceString(input.incidentId),
    workOrderId: optionalMaintenanceString(input.workOrderId),
    parentMaintenanceId: optionalMaintenanceString(input.parentMaintenanceId),
    sourceRequestId: optionalMaintenanceString(input.sourceRequestId),
    reportedAt: toIsoOrThrow(input.reportedAt, "Reported at"),
    scheduledStartAt: toOptionalIso(input.scheduledStartAt, "Scheduled start"),
    scheduledEndAt: toOptionalIso(input.scheduledEndAt, "Scheduled end"),
    dueAt: toOptionalIso(input.dueAt, "Due at"),
    startedAt: toOptionalIso(input.startedAt, "Started at"),
    completedAt: toOptionalIso(input.completedAt, "Completed at"),
    holdReason: optionalMaintenanceString(input.holdReason),
    completionNotes: optionalMaintenanceString(input.completionNotes),
    workPerformed: optionalMaintenanceString(input.workPerformed),
  });
}

function validateIncidentInput(
  input: CreateIncidentInput,
  actorUserId: string,
  now: string
): CreateIncidentInput {
  const title = input.title?.trim() ?? "";
  const facilityId = input.facilityId?.trim() ?? "";
  if (!title) {
    throw new ActionError("VALIDATION_ERROR", "Title is required.");
  }
  if (!facilityId) {
    throw new ActionError("VALIDATION_ERROR", "Facility is required.");
  }

  const severityRaw = String(input.severity ?? "medium");
  if (!isOneOf(severityRaw, INCIDENT_SEVERITIES)) {
    throw new ActionError("VALIDATION_ERROR", "Severity is invalid.");
  }
  const severity: IncidentSeverity = severityRaw;

  const type: IncidentType = isOneOf(String(input.type), INCIDENT_TYPES)
    ? input.type
    : "other";
  const source: IncidentSource = isOneOf(String(input.source), INCIDENT_SOURCES)
    ? input.source
    : "request";
  const status: IncidentStatus = isOneOf(String(input.status), INCIDENT_STATUSES)
    ? input.status
    : "reported";
  const reportedVia: IncidentChannel = isOneOf(
    String(input.reportedVia ?? "portal"),
    INCIDENT_CHANNELS
  )
    ? (input.reportedVia as IncidentChannel)
    : "portal";

  let reportedAt = now;
  const reportedAtRaw = optionalIncidentString(input.reportedAt);
  if (reportedAtRaw) {
    reportedAt = toIsoOrThrow(reportedAtRaw, "Reported at");
  }

  return applyIncidentWorkOrderRule({
    title,
    facilityId,
    description: optionalIncidentString(input.description) || title,
    locationDetail: optionalIncidentString(input.locationDetail),
    severity,
    type,
    source,
    status,
    reportedVia,
    reportedAt,
    reportedByUserId:
      optionalIncidentString(input.reportedByUserId) ?? actorUserId,
    sourceRequestId: optionalIncidentString(input.sourceRequestId),
    assignedToUserId: optionalIncidentString(input.assignedToUserId),
    assetId: optionalIncidentString(input.assetId),
    requiresWorkOrder: input.requiresWorkOrder === true,
    workOrderId:
      input.requiresWorkOrder === true
        ? optionalIncidentString(input.workOrderId)
        : undefined,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
  });
}

export async function createMaintenanceFromRequest(input: {
  requestId: string;
  maintenance: CreateMaintenanceInput;
  idempotencyKey: string;
}): Promise<ActionResult<RequestTreatmentResult>> {
  return executeAction({
    name: "request.treatment.create_maintenance",
    module: "facility_management",
    input,
    handler: async (context, raw) => {
      const validated = validateMaintenanceInput(raw.maintenance);
      return orchestrateCreateMaintenanceFromRequest({
        requestId: raw.requestId,
        input: {
          ...validated,
          sourceRequestId: raw.requestId,
          source: "request",
        },
        idempotencyKey: raw.idempotencyKey,
        context,
      });
    },
  });
}

/** Phase 15/18 canonical alias — Request → Treat → Work. */
export const createWorkFromRequest = createMaintenanceFromRequest;

export async function createIncidentFromRequest(input: {
  requestId: string;
  incident: CreateIncidentInput;
  idempotencyKey: string;
}): Promise<ActionResult<RequestTreatmentResult>> {
  return executeAction({
    name: "request.treatment.create_incident",
    module: "facility_management",
    input,
    handler: async (context, raw) => {
      assertNewIncidentCreateAllowed("createIncidentFromRequest");

      const validated = validateIncidentInput(
        raw.incident,
        context.userId,
        context.now
      );
      return orchestrateCreateIncidentFromRequest({
        requestId: raw.requestId,
        input: {
          ...validated,
          sourceRequestId: raw.requestId,
          source: "request",
        },
        idempotencyKey: raw.idempotencyKey,
        context,
      });
    },
  });
}

export async function linkMaintenanceToRequest(input: {
  requestId: string;
  maintenanceId: string;
}): Promise<ActionResult<RequestTreatmentResult>> {
  return executeAction({
    name: "request.treatment.link_maintenance",
    module: "facility_management",
    input,
    handler: async (context, raw) =>
      orchestrateLinkMaintenanceToRequest({
        requestId: raw.requestId,
        maintenanceId: raw.maintenanceId,
        context,
      }),
  });
}

export async function linkIncidentToRequest(input: {
  requestId: string;
  incidentId: string;
}): Promise<ActionResult<RequestTreatmentResult>> {
  return executeAction({
    name: "request.treatment.link_incident",
    module: "facility_management",
    input,
    handler: async (context, raw) =>
      orchestrateLinkIncidentToRequest({
        requestId: raw.requestId,
        incidentId: raw.incidentId,
        context,
      }),
  });
}

export async function resolveRequest(input: {
  requestId: string;
}): Promise<ActionResult<RequestRecord>> {
  return executeAction({
    name: "request.treatment.resolve",
    module: "facility_management",
    input,
    handler: async (context, raw) =>
      orchestrateResolveRequest({
        requestId: raw.requestId,
        context,
      }),
  });
}

export async function cancelRequest(input: {
  requestId: string;
}): Promise<ActionResult<RequestRecord>> {
  return executeAction({
    name: "request.treatment.cancel",
    module: "facility_management",
    input,
    handler: async (context, raw) =>
      orchestrateCancelRequest({
        requestId: raw.requestId,
        context,
      }),
  });
}

export async function startRequestReview(input: {
  requestId: string;
}): Promise<ActionResult<RequestRecord>> {
  return executeAction({
    name: "request.treatment.start_review",
    module: "facility_management",
    input,
    handler: async (context, raw) =>
      orchestrateStartRequestReview({
        requestId: raw.requestId,
        context,
      }),
  });
}

export async function getRequestTreatmentDetail(input: {
  requestId: string;
}): Promise<ActionResult<RequestTreatmentDetail>> {
  return executeAction({
    name: "request.treatment.get_detail",
    module: "facility_management",
    input,
    handler: async (_context, raw) =>
      loadRequestTreatmentDetail(raw.requestId),
  });
}

export async function searchMaintenanceForRequestLink(input: {
  requestId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<
  ActionResult<{ data: LinkableSearchHit[]; total: number; page: number }>
> {
  return executeAction({
    name: "request.treatment.search_maintenance",
    module: "facility_management",
    input,
    handler: async (_context, raw) => searchLinkableMaintenance(raw),
  });
}

export async function searchIncidentsForRequestLink(input: {
  requestId: string;
  search?: string;
  page?: number;
  pageSize?: number;
}): Promise<
  ActionResult<{ data: LinkableSearchHit[]; total: number; page: number }>
> {
  return executeAction({
    name: "request.treatment.search_incidents",
    module: "facility_management",
    input,
    handler: async (_context, raw) => searchLinkableIncidents(raw),
  });
}

