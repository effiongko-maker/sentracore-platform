import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  appendUniqueId,
  formatIdList,
  parseIdList,
  primaryId,
} from "./idLists";

function coalesceIdList(...sources: unknown[]): string[] {
  for (const source of sources) {
    const parsed = parseIdList(source);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

export type IncidentRelationships = {
  workOrderIds: string[];
  maintenanceIds: string[];
  workOrderId?: string;
};

export type MaintenanceRelationships = {
  workOrderIds: string[];
  workOrderId?: string;
  incidentId?: string;
};

export type WorkOrderRelationships = {
  incidentId?: string;
  maintenanceId?: string;
  parentWorkOrderId?: string;
};

export function normalizeIncidentRelationships(
  input: Partial<Incident>
): IncidentRelationships {
  const raw = input as Partial<Incident> & Record<string, unknown>;
  const workOrderIds = coalesceIdList(
    raw.workOrderIds,
    raw["Work Order IDs"],
    raw.workOrderId
  );
  const maintenanceIds = coalesceIdList(
    raw.maintenanceIds,
    raw["Maintenance IDs"]
  );

  return {
    workOrderIds,
    maintenanceIds,
    workOrderId: primaryId(workOrderIds, input.workOrderId),
  };
}

export function normalizeMaintenanceRelationships(
  input: Partial<Maintenance>
): MaintenanceRelationships {
  const raw = input as Partial<Maintenance> & Record<string, unknown>;
  const workOrderIds = coalesceIdList(
    raw.workOrderIds,
    raw["Work Order IDs"],
    raw.workOrderId
  );

  return {
    workOrderIds,
    workOrderId: primaryId(workOrderIds, raw.workOrderId),
    incidentId: raw.incidentId ?? undefined,
  };
}

export function normalizeWorkOrderRelationships(
  input: Partial<WorkOrder> & Record<string, unknown>
): WorkOrderRelationships {
  return {
    incidentId: input.incidentId ?? undefined,
    maintenanceId:
      (input as { maintenanceId?: string }).maintenanceId ?? undefined,
    parentWorkOrderId: input.parentWorkOrderId ?? undefined,
  };
}

export function incidentPayloadWithRelationships(
  incident: Partial<Incident>,
  rel: Partial<IncidentRelationships>
): Record<string, unknown> {
  const workOrderIds = rel.workOrderIds ?? incident.workOrderIds ?? [];
  const maintenanceIds = rel.maintenanceIds ?? incident.maintenanceIds ?? [];
  return {
    ...incident,
    workOrderIds,
    maintenanceIds,
    workOrderId: primaryId(workOrderIds, incident.workOrderId),
    "Work Order IDs": formatIdList(workOrderIds),
    "Maintenance IDs": formatIdList(maintenanceIds),
  };
}

export function maintenancePayloadWithRelationships(
  maintenance: Partial<Maintenance>,
  rel: Partial<MaintenanceRelationships>
): Record<string, unknown> {
  const workOrderIds = rel.workOrderIds ?? maintenance.workOrderIds ?? [];
  return {
    ...maintenance,
    workOrderIds,
    workOrderId: primaryId(workOrderIds, maintenance.workOrderId),
    incidentId: rel.incidentId ?? maintenance.incidentId,
    "Work Order IDs": formatIdList(workOrderIds),
    "Incident ID": rel.incidentId ?? maintenance.incidentId ?? "",
  };
}

export function workOrderPayloadWithRelationships(
  workOrder: Partial<WorkOrder>,
  rel: Partial<WorkOrderRelationships>
): Record<string, unknown> {
  return {
    ...workOrder,
    incidentId: rel.incidentId ?? workOrder.incidentId ?? "",
    maintenanceId: rel.maintenanceId ?? "",
    parentWorkOrderId: rel.parentWorkOrderId ?? workOrder.parentWorkOrderId ?? "",
    "Incident ID": rel.incidentId ?? workOrder.incidentId ?? "",
    "Maintenance ID": rel.maintenanceId ?? "",
    "Parent Work Order ID": rel.parentWorkOrderId ?? workOrder.parentWorkOrderId ?? "",
  };
}

export function linkWorkOrderToIncident(
  incident: IncidentRelationships,
  workOrderId: string
): IncidentRelationships {
  const workOrderIds = appendUniqueId(incident.workOrderIds, workOrderId);
  return { ...incident, workOrderIds, workOrderId: primaryId(workOrderIds) };
}

export function linkMaintenanceToIncident(
  incident: IncidentRelationships,
  maintenanceId: string
): IncidentRelationships {
  const maintenanceIds = appendUniqueId(incident.maintenanceIds, maintenanceId);
  return { ...incident, maintenanceIds };
}

export function linkWorkOrderToMaintenance(
  maintenance: MaintenanceRelationships,
  workOrderId: string
): MaintenanceRelationships {
  const workOrderIds = appendUniqueId(maintenance.workOrderIds, workOrderId);
  return {
    ...maintenance,
    workOrderIds,
    workOrderId: primaryId(workOrderIds),
  };
}
