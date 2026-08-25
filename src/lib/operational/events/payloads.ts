import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import type { OperationalIntakeSource } from "../intake";

export type OperationalRelationshipContext = {
  incidentId?: string | null;
  maintenanceId?: string | null;
  workOrderId?: string | null;
  parentWorkOrderId?: string | null;
  facilityId?: string | null;
  assetId?: string | null;
};

export function withIntakeMetadata(
  data: Record<string, unknown>,
  intake: OperationalIntakeSource,
  sourceReference?: string
): Record<string, unknown> {
  return {
    ...data,
    intakeSource: intake,
    ...(sourceReference ? { sourceReference } : {}),
  };
}

export function incidentEventData(
  incident: Incident,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    incidentId: incident.id,
    title: incident.title,
    facilityId: incident.facilityId,
    assetId: incident.assetId ?? null,
    locationDetail: incident.locationDetail ?? null,
    severity: incident.severity,
    type: incident.type,
    source: incident.source,
    status: incident.status,
    isEmergency: incident.isEmergency ?? false,
    requiresWorkOrder: incident.requiresWorkOrder ?? false,
    reportedVia: incident.reportedVia ?? null,
    workOrderIds: incident.workOrderIds ?? [],
    maintenanceIds: incident.maintenanceIds ?? [],
    ...extra,
  };
}

export function maintenanceEventData(
  maintenance: Maintenance,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    maintenanceId: maintenance.id,
    title: maintenance.title,
    facilityId: maintenance.facilityId,
    assetId: maintenance.assetId ?? null,
    department: maintenance.department ?? null,
    type: maintenance.type,
    source: maintenance.source,
    priority: maintenance.priority,
    status: maintenance.status,
    requiresWorkOrder: maintenance.requiresWorkOrder ?? false,
    incidentId: maintenance.incidentId ?? null,
    workOrderIds: maintenance.workOrderIds ?? [],
    categoryId: maintenance.categoryId ?? null,
    dueAt: maintenance.dueAt ?? null,
    ...extra,
  };
}

export function workOrderEventData(
  workOrder: WorkOrder,
  extra?: Record<string, unknown>
): Record<string, unknown> {
  return {
    workOrderId: workOrder.id,
    title: workOrder.title,
    facilityId: workOrder.facilityId,
    assetId: workOrder.assetId ?? null,
    type: workOrder.type,
    source: workOrder.source,
    priority: workOrder.priority,
    status: workOrder.status,
    incidentId: workOrder.incidentId ?? null,
    maintenanceId: workOrder.maintenanceId ?? null,
    workOrderIds: [workOrder.id],
    parentWorkOrderId: workOrder.parentWorkOrderId ?? null,
    assignedToUserId: workOrder.assignedToUserId ?? null,
    ...extra,
  };
}

export function relationshipContext(
  ctx: OperationalRelationshipContext
): Record<string, unknown> {
  return {
    incidentId: ctx.incidentId ?? null,
    maintenanceId: ctx.maintenanceId ?? null,
    workOrderId: ctx.workOrderId ?? null,
    parentWorkOrderId: ctx.parentWorkOrderId ?? null,
    facilityId: ctx.facilityId ?? null,
    assetId: ctx.assetId ?? null,
  };
}
