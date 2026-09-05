"use server";

import {
  ActionError,
  executeAction,
  type ActionResult,
} from "@/lib/actions";
import {
  orchestrateReportIncident,
} from "@/lib/operational/orchestration";
import { assertNewIncidentCreateAllowed } from "@/lib/operational/work/incidentWriteFreeze";
import {
  INCIDENT_CHANNELS,
  INCIDENT_SEVERITIES,
  INCIDENT_SOURCES,
  INCIDENT_STATUSES,
  INCIDENT_TYPES,
} from "@/modules/incidents/constants";
import type {
  CreateIncidentInput,
  Incident,
  IncidentChannel,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  IncidentType,
  ReportIncidentInput,
} from "@/modules/incidents/types";
import { applyWorkOrderRule, optionalString } from "@/modules/incidents/utils";

export type ReportIncidentOptions = {
  departmentId?: string | null;
};

function isOneOf<T extends string>(
  value: string,
  allowed: readonly T[]
): value is T {
  return (allowed as readonly string[]).includes(value);
}

function optionalEnum<T extends string>(
  value: string | undefined,
  allowed: readonly T[],
  fieldLabel: string
): T | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (!isOneOf(trimmed, allowed)) {
    throw new ActionError(
      "VALIDATION_ERROR",
      `${fieldLabel} is invalid.`
    );
  }
  return trimmed;
}

/**
 * Validate reporting contract and enrich to CreateIncidentInput.
 * finalValue = explicitlyProvidedValue ?? serverDefault
 * createdBy / updatedBy always come from the authenticated actor.
 */
function enrichReportIncidentInput(
  input: ReportIncidentInput,
  actorUserId: string,
  reportedAtDefault: string
): CreateIncidentInput {
  const title = input.title?.trim() ?? "";
  const facilityId = input.facilityId?.trim() ?? "";

  if (!title) {
    throw new ActionError("VALIDATION_ERROR", "What happened is required.");
  }
  if (!facilityId) {
    throw new ActionError("VALIDATION_ERROR", "Facility is required.");
  }

  const severityRaw = (input.severity ?? "medium").toString();
  if (!isOneOf(severityRaw, INCIDENT_SEVERITIES)) {
    throw new ActionError("VALIDATION_ERROR", "Severity is invalid.");
  }
  const severity: IncidentSeverity = severityRaw;

  const type: IncidentType =
    optionalEnum(input.type, INCIDENT_TYPES, "Type") ?? "other";
  const source: IncidentSource =
    optionalEnum(input.source, INCIDENT_SOURCES, "Source") ?? "manual";
  const status: IncidentStatus =
    optionalEnum(input.status, INCIDENT_STATUSES, "Status") ?? "reported";
  const reportedVia: IncidentChannel =
    optionalEnum(input.reportedVia, INCIDENT_CHANNELS, "Reported via") ??
    "portal";

  const reportedByUserId =
    optionalString(input.reportedByUserId) ?? actorUserId;

  let reportedAt = reportedAtDefault;
  const reportedAtRaw = optionalString(input.reportedAt);
  if (reportedAtRaw) {
    const ms = Date.parse(reportedAtRaw);
    if (!Number.isFinite(ms)) {
      throw new ActionError("VALIDATION_ERROR", "Reported at is invalid.");
    }
    reportedAt = new Date(ms).toISOString();
  }

  const requiresWorkOrder = input.requiresWorkOrder === true;
  const workOrderId = requiresWorkOrder
    ? optionalString(input.workOrderId)
    : undefined;

  if (!requiresWorkOrder && optionalString(input.workOrderId)) {
    throw new ActionError(
      "VALIDATION_ERROR",
      "Work order must be empty when requires work order is false."
    );
  }

  return applyWorkOrderRule({
    title,
    facilityId,
    description: optionalString(input.description),
    locationDetail: optionalString(input.locationDetail),
    severity,
    type,
    source,
    status,
    reportedVia,
    reportedAt,
    reportedByUserId,
    createdByUserId: actorUserId,
    updatedByUserId: actorUserId,
    requiresWorkOrder,
    workOrderId,
    assignedToUserId: optionalString(input.assignedToUserId),
    assetId: optionalString(input.assetId),
    assignedGroupId: undefined,
    categoryId: undefined,
    parentIncidentId: undefined,
  });
}

/**
 * incident.report → domain write → facility.incident_reported
 */
export async function reportIncident(
  input: ReportIncidentInput,
  options: ReportIncidentOptions = {}
): Promise<ActionResult<Incident>> {
  return executeAction({
    name: "incident.report",
    module: "facility_management",
    requiredCapability: "ops.create",
    input,
    departmentId: options.departmentId,
    handler: async (context, rawInput) => {
      assertNewIncidentCreateAllowed("reportIncident");

      const writeInput = enrichReportIncidentInput(
        rawInput,
        context.userId,
        context.now
      );

      const incident = await orchestrateReportIncident({
        input: writeInput,
        intake: "staff",
        context,
      });

      return incident;
    },
  });
}
