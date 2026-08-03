import type { CreateWorkOrderInput, WorkOrder } from "./types";

export function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export function toCreateFormValues(
  workOrder?: WorkOrder | null
): CreateWorkOrderInput {
  return {
    title: workOrder?.title ?? "",
    description: workOrder?.description ?? "",
    type: workOrder?.type ?? "corrective",
    maintenanceType: workOrder?.maintenanceType,
    source: workOrder?.source ?? "manual",
    categoryId: workOrder?.categoryId ?? "",
    workInstructions: workOrder?.workInstructions ?? "",
    facilityId: workOrder?.facilityId ?? "",
    assetId: workOrder?.assetId ?? "",
    reportedByUserId: workOrder?.reportedByUserId ?? "",
    incidentId: workOrder?.incidentId ?? "",
    parentWorkOrderId: workOrder?.parentWorkOrderId ?? "",
    assignedToUserId: workOrder?.assignedToUserId ?? "",
    assignedGroupId: workOrder?.assignedGroupId ?? "",
    requestedAt: workOrder?.requestedAt ?? "",
    scheduledStartAt: workOrder?.scheduledStartAt ?? "",
    scheduledEndAt: workOrder?.scheduledEndAt ?? "",
    dueAt: workOrder?.dueAt ? workOrder.dueAt.slice(0, 10) : "",
    status: workOrder?.status ?? "open",
    priority: workOrder?.priority ?? "medium",
    holdReason: workOrder?.holdReason ?? "",
    startedAt: workOrder?.startedAt ?? "",
    completedAt: workOrder?.completedAt ?? "",
    estimatedHours: workOrder?.estimatedHours,
    actualHours: workOrder?.actualHours,
    estimatedCost: workOrder?.estimatedCost,
    actualCost: workOrder?.actualCost,
    completionNotes: workOrder?.completionNotes ?? "",
    workPerformed: workOrder?.workPerformed ?? "",
    downtimeMinutes: workOrder?.downtimeMinutes,
    slaDueAt: workOrder?.slaDueAt ?? "",
    requiresApproval: workOrder?.requiresApproval,
    createdByUserId: workOrder?.createdByUserId ?? "",
    updatedByUserId: workOrder?.updatedByUserId ?? "",
  };
}

export function optionalString(value?: string) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
