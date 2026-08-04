import type { CreateMaintenanceInput, Maintenance } from "./types";

export function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function optionalString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/** Enforce: requiresWorkOrder=false ⇒ workOrderId must be undefined. */
export function applyWorkOrderRule<
  T extends { requiresWorkOrder?: boolean; workOrderId?: string },
>(input: T): T {
  if (input.requiresWorkOrder === false) {
    return { ...input, workOrderId: undefined };
  }
  return input;
}

export function toCreateFormValues(
  maintenance?: Maintenance | null
): CreateMaintenanceInput {
  return {
    title: maintenance?.title ?? "",
    description: maintenance?.description ?? "",
    type: maintenance?.type ?? "corrective",
    source: maintenance?.source ?? "manual",
    categoryId: maintenance?.categoryId ?? "",
    department: maintenance?.department ?? "",
    facilityId: maintenance?.facilityId ?? "",
    assetId: maintenance?.assetId ?? "",
    reportedByUserId: maintenance?.reportedByUserId ?? "",
    assignedToUserId: maintenance?.assignedToUserId ?? "",
    assignedGroupId: maintenance?.assignedGroupId ?? "",
    eventId: maintenance?.eventId ?? "",
    incidentId: maintenance?.incidentId ?? "",
    workOrderId: maintenance?.workOrderId ?? "",
    parentMaintenanceId: maintenance?.parentMaintenanceId ?? "",
    priority: maintenance?.priority ?? "medium",
    status: maintenance?.status ?? "requested",
    holdReason: maintenance?.holdReason ?? "",
    requiresWorkOrder: maintenance?.requiresWorkOrder ?? false,
    reportedAt: maintenance?.reportedAt
      ? maintenance.reportedAt.slice(0, 16)
      : new Date().toISOString().slice(0, 16),
    scheduledStartAt: maintenance?.scheduledStartAt
      ? maintenance.scheduledStartAt.slice(0, 16)
      : "",
    scheduledEndAt: maintenance?.scheduledEndAt
      ? maintenance.scheduledEndAt.slice(0, 16)
      : "",
    dueAt: maintenance?.dueAt ? maintenance.dueAt.slice(0, 16) : "",
    startedAt: maintenance?.startedAt
      ? maintenance.startedAt.slice(0, 16)
      : "",
    completedAt: maintenance?.completedAt
      ? maintenance.completedAt.slice(0, 16)
      : "",
    completionNotes: maintenance?.completionNotes ?? "",
    workPerformed: maintenance?.workPerformed ?? "",
    createdByUserId: maintenance?.createdByUserId ?? "",
    updatedByUserId: maintenance?.updatedByUserId ?? "",
  };
}
