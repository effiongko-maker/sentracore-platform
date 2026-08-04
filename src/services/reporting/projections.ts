import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  isCriticalOpenIncident,
  isMaintenanceBacklog,
  isOpenWorkOrder,
} from "./kpis";
import type { ReportingListItem, ReportingProjections } from "./types";

const LIST_LIMIT = 5;

function labelize(value: string) {
  return value
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toneFromPriority(
  priority: string
): ReportingListItem["tone"] {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "info";
  return "neutral";
}

function toneFromSeverity(
  severity: string
): ReportingListItem["tone"] {
  return toneFromPriority(severity);
}

function sortByDateDesc<T>(
  rows: T[],
  getDate: (row: T) => string | undefined
) {
  return [...rows].sort((a, b) => {
    const left = getDate(a) || "";
    const right = getDate(b) || "";
    return right.localeCompare(left);
  });
}

function projectWorkOrders(
  workOrders: WorkOrder[],
  predicate: (wo: WorkOrder) => boolean
): ReportingListItem[] {
  return sortByDateDesc(
    workOrders.filter(predicate),
    (wo) => wo.dueAt || wo.requestedAt
  )
    .slice(0, LIST_LIMIT)
    .map((wo) => ({
      module: "work-orders" as const,
      entityId: wo.id,
      title: wo.title || wo.id,
      meta: `${labelize(wo.priority)} · ${labelize(wo.status)}`,
      reportedAt: wo.requestedAt,
      tone: toneFromPriority(wo.priority),
    }));
}

function projectIncidents(incidents: Incident[]): ReportingListItem[] {
  return sortByDateDesc(
    incidents.filter(isCriticalOpenIncident),
    (incident) => incident.reportedAt
  )
    .slice(0, LIST_LIMIT)
    .map((incident) => ({
      module: "incidents" as const,
      entityId: incident.id,
      title: incident.title || incident.id,
      meta: `${labelize(incident.severity)} · ${labelize(incident.status)}`,
      reportedAt: incident.reportedAt,
      tone: toneFromSeverity(incident.severity),
    }));
}

function projectMaintenance(
  maintenance: Maintenance[],
  predicate: (row: Maintenance) => boolean
): ReportingListItem[] {
  return sortByDateDesc(
    maintenance.filter(predicate),
    (row) => row.dueAt || row.reportedAt
  )
    .slice(0, LIST_LIMIT)
    .map((row) => ({
      module: "maintenance" as const,
      entityId: row.id,
      title: row.title || row.id,
      meta: `${labelize(row.priority)} · ${labelize(row.status)}`,
      reportedAt: row.reportedAt,
      tone: toneFromPriority(row.priority),
    }));
}

function isOverdueWorkOrder(wo: WorkOrder, asOf: string) {
  if (!isOpenWorkOrder(wo) || !wo.dueAt) return false;
  return wo.dueAt.slice(0, 10) < asOf.slice(0, 10);
}

export function computeReportingProjections(input: {
  asOf: string;
  incidents: Incident[];
  maintenance: Maintenance[];
  workOrders: WorkOrder[];
}): ReportingProjections {
  const { asOf, incidents, maintenance, workOrders } = input;

  return {
    criticalIncidents: projectIncidents(incidents),
    openWorkOrders: projectWorkOrders(workOrders, isOpenWorkOrder),
    overdueWorkOrders: projectWorkOrders(workOrders, (wo) =>
      isOverdueWorkOrder(wo, asOf)
    ),
    upcomingMaintenance: projectMaintenance(maintenance, (row) =>
      isMaintenanceBacklog(row)
    ),
    inProgressWorkOrders: projectWorkOrders(
      workOrders,
      (wo) => wo.status === "in_progress"
    ),
    inProgressMaintenance: projectMaintenance(
      maintenance,
      (row) => row.status === "in_progress"
    ),
  };
}
