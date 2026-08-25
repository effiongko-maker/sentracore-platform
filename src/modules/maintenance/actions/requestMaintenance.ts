"use server";

import {
  ActionError,
  executeAction,
  type ActionResult,
} from "@/lib/actions";
import { orchestrateRequestMaintenance } from "@/lib/operational/orchestration";
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_SOURCES,
  MAINTENANCE_STATUSES,
  MAINTENANCE_TYPES,
} from "@/modules/maintenance/constants";
import type {
  CreateMaintenanceInput,
  Maintenance,
} from "@/modules/maintenance/types";
import {
  applyWorkOrderRule,
  optionalString,
} from "@/modules/maintenance/utils";

export type RequestMaintenanceOptions = {
  departmentId?: string | null;
};

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

/**
 * Validate CreateMaintenanceInput against the live Maintenance form contract.
 * Throws ActionError(VALIDATION_ERROR) on failure.
 */
function validateRequestMaintenanceInput(
  input: CreateMaintenanceInput
): CreateMaintenanceInput {
  const title = input.title?.trim() ?? "";
  const facilityId = input.facilityId?.trim() ?? "";

  if (!title) {
    throw new ActionError("VALIDATION_ERROR", "Title is required.");
  }
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

  if (input.requiresWorkOrder === false && optionalString(input.workOrderId)) {
    throw new ActionError(
      "VALIDATION_ERROR",
      "Work order must be empty when requires work order is false."
    );
  }

  // Match form behavior: description falls back to title when empty.
  const description = optionalString(input.description) || title;

  return applyWorkOrderRule({
    ...input,
    title,
    description,
    facilityId,
    categoryId: optionalString(input.categoryId),
    department: optionalString(input.department),
    assetId: optionalString(input.assetId),
    reportedByUserId: optionalString(input.reportedByUserId),
    assignedToUserId: optionalString(input.assignedToUserId),
    assignedGroupId: optionalString(input.assignedGroupId),
    eventId: optionalString(input.eventId),
    incidentId: optionalString(input.incidentId),
    workOrderId: optionalString(input.workOrderId),
    parentMaintenanceId: optionalString(input.parentMaintenanceId),
    reportedAt: toIsoOrThrow(input.reportedAt, "Reported at"),
    scheduledStartAt: toOptionalIso(input.scheduledStartAt, "Scheduled start"),
    scheduledEndAt: toOptionalIso(input.scheduledEndAt, "Scheduled end"),
    dueAt: toOptionalIso(input.dueAt, "Due at"),
    startedAt: toOptionalIso(input.startedAt, "Started at"),
    completedAt: toOptionalIso(input.completedAt, "Completed at"),
    holdReason: optionalString(input.holdReason),
    completionNotes: optionalString(input.completionNotes),
    workPerformed: optionalString(input.workPerformed),
  });
}

/**
 * Second SentraCore vertical slice:
 * maintenance.request → domain write (existing MaintenanceService)
 * → facility.maintenance_requested
 *
 * organisationId / actor / moduleId come from ActionContext — never from the client.
 */
export async function requestMaintenance(
  input: CreateMaintenanceInput,
  options: RequestMaintenanceOptions = {}
): Promise<ActionResult<Maintenance>> {
  return executeAction({
    name: "maintenance.request",
    module: "facility_management",
    input,
    departmentId: options.departmentId,
    handler: async (context, rawInput) => {
      const validated = validateRequestMaintenanceInput(rawInput);

      const writeInput: CreateMaintenanceInput = {
        ...validated,
        createdByUserId: context.userId,
        updatedByUserId: context.userId,
        reportedByUserId: validated.reportedByUserId || context.userId,
      };

      const maintenance = await orchestrateRequestMaintenance({
        input: writeInput,
        intake: "staff",
        context,
      });

      return maintenance;
    },
  });
}
