import type {
  LifecycleEventRow,
  OperationalTimelineEntityType,
  OperationalTimelineEvent,
} from "./types";

function asNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => asNonEmptyString(item))
      .filter((item): item is string => item != null);
  }
  const single = asNonEmptyString(value);
  return single ? [single] : [];
}

function mapEntityType(
  entityType: string | null,
  eventType: string
): OperationalTimelineEntityType | string {
  if (entityType === "incident" || entityType === "maintenance" || entityType === "work_order") {
    return entityType;
  }
  if (entityType === "maintenance_request") return "maintenance";
  if (eventType.startsWith("facility.incident_")) return "incident";
  if (eventType.startsWith("facility.maintenance_")) return "maintenance";
  if (eventType.startsWith("facility.work_order_")) return "work_order";
  return entityType ?? "unknown";
}

export function normalizeOperationalTimelineEvent(
  row: LifecycleEventRow
): OperationalTimelineEvent | null {
  const data = row.data ?? {};
  const entityId =
    asNonEmptyString(row.entity_id) ??
    asNonEmptyString(data.incidentId) ??
    asNonEmptyString(data.maintenanceId) ??
    asNonEmptyString(data.workOrderId);
  if (!entityId) return null;

  const workOrderIds = asStringArray(data.workOrderIds);
  const workOrderId = asNonEmptyString(data.workOrderId);
  if (workOrderId && !workOrderIds.includes(workOrderId)) {
    workOrderIds.push(workOrderId);
  }

  return {
    id: row.id,
    occurredAt: row.occurred_at,
    entityType: mapEntityType(row.entity_type, row.event_type),
    entityId,
    eventType: row.event_type,
    facilityId: asNonEmptyString(data.facilityId),
    assetId: asNonEmptyString(data.assetId),
    incidentId: asNonEmptyString(data.incidentId) ?? (row.entity_type === "incident" ? entityId : null),
    maintenanceId:
      asNonEmptyString(data.maintenanceId) ??
      (row.entity_type === "maintenance_request" || row.entity_type === "maintenance"
        ? entityId
        : null),
    workOrderIds,
    previousStatus: asNonEmptyString(data.previousStatus),
    nextStatus: asNonEmptyString(data.nextStatus) ?? asNonEmptyString(data.status),
    actor: asNonEmptyString(data.actor),
    intakeSource: asNonEmptyString(data.intakeSource),
    transitionSource: asNonEmptyString(data.transitionSource),
    issueType: asNonEmptyString(data.type),
    categoryId: asNonEmptyString(data.categoryId),
  };
}

export function matchesTimelineQuery(
  event: OperationalTimelineEvent,
  query: {
    facilityId?: string;
    assetId?: string;
    incidentId?: string;
    maintenanceId?: string;
    workOrderId?: string;
  }
): boolean {
  if (query.facilityId && event.facilityId !== query.facilityId) return false;
  if (query.assetId && event.assetId !== query.assetId) return false;
  if (query.incidentId) {
    const hit =
      event.incidentId === query.incidentId ||
      (event.entityType === "incident" && event.entityId === query.incidentId);
    if (!hit) return false;
  }
  if (query.maintenanceId) {
    const hit =
      event.maintenanceId === query.maintenanceId ||
      (event.entityType === "maintenance" && event.entityId === query.maintenanceId);
    if (!hit) return false;
  }
  if (query.workOrderId) {
    const hit =
      event.entityId === query.workOrderId ||
      (event.workOrderIds ?? []).includes(query.workOrderId);
    if (!hit) return false;
  }
  return true;
}
