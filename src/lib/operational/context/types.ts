import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";

export type OperationalContextItem = {
  entityType: "incident" | "maintenance" | "work_order";
  id: string;
  title: string;
  status: string;
};

export type OperationalHistoryEntry = {
  occurredAt: string;
  label: string;
  eventType?: string;
  entityType?: string;
  entityId?: string;
};

export type RelatedOperationalContext = {
  anchor: {
    entityType: "incident" | "maintenance" | "work_order";
    id: string;
    title: string;
  };
  related: OperationalContextItem[];
  links: {
    incidentId?: string;
    maintenanceId?: string;
    workOrderIds: string[];
    facilityId?: string;
    assetId?: string;
  };
  history: OperationalHistoryEntry[];
};

export function buildIncidentOperationalContext(options: {
  incident: Incident;
  maintenance: Maintenance[];
  workOrders: WorkOrder[];
  history?: OperationalHistoryEntry[];
}): RelatedOperationalContext {
  const { incident, maintenance, workOrders } = options;

  const related: OperationalContextItem[] = [
    ...maintenance.map((item) => ({
      entityType: "maintenance" as const,
      id: item.id,
      title: item.title,
      status: item.status,
    })),
    ...workOrders.map((item) => ({
      entityType: "work_order" as const,
      id: item.id,
      title: item.title,
      status: item.status,
    })),
  ];

  return {
    anchor: {
      entityType: "incident",
      id: incident.id,
      title: incident.title,
    },
    related,
    links: {
      incidentId: incident.id,
      maintenanceId: maintenance[0]?.id,
      workOrderIds: incident.workOrderIds ?? [],
      facilityId: incident.facilityId,
      assetId: incident.assetId,
    },
    history: options.history ?? [],
  };
}

export function eventTypeToHistoryLabel(eventType: string): string {
  const labels: Record<string, string> = {
    "facility.incident_reported": "Incident reported",
    "facility.incident_triaged": "Triage completed",
    "facility.incident_escalated": "Incident escalated",
    "facility.incident_resolved": "Incident resolved",
    "facility.maintenance_requested": "Maintenance requested",
    "facility.maintenance_scheduled": "Maintenance scheduled",
    "facility.maintenance_started": "Maintenance started",
    "facility.maintenance_completed": "Maintenance completed",
    "facility.work_order_created": "Work order created",
    "facility.work_order_assigned": "Work order assigned",
    "facility.work_order_started": "Work order started",
    "facility.work_order_completed": "Work order completed",
    "facility.work_order_cancelled": "Work order cancelled",
  };
  return labels[eventType] ?? eventType.replace(/^facility\./, "").replace(/_/g, " ");
}
