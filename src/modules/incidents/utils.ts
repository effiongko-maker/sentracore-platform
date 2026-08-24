import type { CreateIncidentInput, Incident } from "./types";

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
export function applyWorkOrderRule<T extends { requiresWorkOrder?: boolean; workOrderId?: string }>(
  input: T
): T {
  if (input.requiresWorkOrder === false) {
    return { ...input, workOrderId: undefined };
  }
  return input;
}

export function toCreateFormValues(
  incident?: Incident | null
): CreateIncidentInput {
  return {
    title: incident?.title ?? "",
    description: incident?.description ?? "",
    type: incident?.type ?? "other",
    source: incident?.source ?? "manual",
    categoryId: incident?.categoryId ?? "",
    facilityId: incident?.facilityId ?? "",
    assetId: incident?.assetId ?? "",
    locationDetail: incident?.locationDetail ?? "",
    reportedByUserId: incident?.reportedByUserId ?? "",
    assignedToUserId: incident?.assignedToUserId ?? "",
    assignedGroupId: incident?.assignedGroupId ?? "",
    workOrderId: incident?.workOrderId ?? "",
    parentIncidentId: incident?.parentIncidentId ?? "",
    reportedAt: incident?.reportedAt
      ? incident.reportedAt.slice(0, 16)
      : new Date().toISOString().slice(0, 16),
    discoveredAt: incident?.discoveredAt ?? "",
    reportedVia: incident?.reportedVia,
    severity: incident?.severity ?? "medium",
    peopleAffected: incident?.peopleAffected,
    isEmergency: incident?.isEmergency,
    status: incident?.status ?? "reported",
    holdReason: incident?.holdReason ?? "",
    requiresWorkOrder: incident?.requiresWorkOrder ?? false,
    acknowledgedAt: incident?.acknowledgedAt ?? "",
    responseDueAt: incident?.responseDueAt ?? "",
    containedAt: incident?.containedAt ?? "",
    resolvedAt: incident?.resolvedAt ?? "",
    closedAt: incident?.closedAt ?? "",
    immediateActions: incident?.immediateActions ?? "",
    rootCause: incident?.rootCause ?? "",
    correctiveActions: incident?.correctiveActions ?? "",
    preventiveActions: incident?.preventiveActions ?? "",
    resolutionNotes: incident?.resolutionNotes ?? "",
    createdByUserId: incident?.createdByUserId ?? "",
    updatedByUserId: incident?.updatedByUserId ?? "",
  };
}
