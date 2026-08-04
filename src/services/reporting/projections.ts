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

function toneFromPriority(priority: string): ReportingListItem["tone"] {
  if (priority === "critical") return "danger";
  if (priority === "high") return "warning";
  if (priority === "medium") return "info";
  return "neutral";
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

function isOverdueWorkOrder(wo: WorkOrder, asOf: string) {
  if (!isOpenWorkOrder(wo) || !wo.dueAt) return false;
  return wo.dueAt.slice(0, 10) < asOf.slice(0, 10);
}

function isOverdueMaintenance(row: Maintenance, asOf: string) {
  if (!isMaintenanceBacklog(row) || !row.dueAt) return false;
  return row.dueAt.slice(0, 10) < asOf.slice(0, 10);
}

function projectWorkOrder(wo: WorkOrder): ReportingListItem {
  return {
    module: "work-orders",
    entityId: wo.id,
    title: wo.title || wo.id,
    status: wo.status,
    priority: wo.priority,
    facilityId: wo.facilityId,
    meta: `${labelize(wo.priority)} · ${labelize(wo.status)}`,
    reportedAt: wo.requestedAt,
    tone: toneFromPriority(wo.priority),
  };
}

function projectMaintenanceRow(row: Maintenance): ReportingListItem {
  return {
    module: "maintenance",
    entityId: row.id,
    title: row.title || row.id,
    status: row.status,
    priority: row.priority,
    facilityId: row.facilityId,
    meta: `${labelize(row.priority)} · ${labelize(row.status)}`,
    reportedAt: row.reportedAt,
    tone: toneFromPriority(row.priority),
  };
}

function projectIncident(incident: Incident): ReportingListItem {
  return {
    module: "incidents",
    entityId: incident.id,
    title: incident.title || incident.id,
    status: incident.status,
    priority: incident.severity,
    facilityId: incident.facilityId,
    meta: `${labelize(incident.severity)} · ${labelize(incident.status)}`,
    reportedAt: incident.reportedAt,
    tone: toneFromPriority(incident.severity),
  };
}

export function computeReportingProjections(input: {
  asOf: string;
  incidents: Incident[];
  maintenance: Maintenance[];
  workOrders: WorkOrder[];
}): ReportingProjections {
  const { asOf, incidents, maintenance, workOrders } = input;

  const overdueWorkOrders = sortByDateDesc(
    workOrders.filter((wo) => isOverdueWorkOrder(wo, asOf)),
    (wo) => wo.dueAt || wo.requestedAt
  )
    .slice(0, LIST_LIMIT)
    .map(projectWorkOrder);

  const maintenanceAttention = sortByDateDesc(
    maintenance.filter(
      (row) =>
        isOverdueMaintenance(row, asOf) ||
        row.status === "on_hold" ||
        row.priority === "critical" ||
        row.priority === "high"
    ),
    (row) => row.dueAt || row.reportedAt
  )
    .slice(0, LIST_LIMIT)
    .map(projectMaintenanceRow);

  const blockedWorkOrders = workOrders
    .filter((wo) => wo.status === "on_hold")
    .map(projectWorkOrder);
  const blockedMaintenance = maintenance
    .filter((row) => row.status === "on_hold")
    .map(projectMaintenanceRow);

  const blockedItems = sortByDateDesc(
    [...blockedWorkOrders, ...blockedMaintenance],
    (item) => item.reportedAt
  ).slice(0, LIST_LIMIT);

  return {
    criticalIncidents: sortByDateDesc(
      incidents.filter(isCriticalOpenIncident),
      (incident) => incident.reportedAt
    )
      .slice(0, LIST_LIMIT)
      .map(projectIncident),
    overdueWorkOrders,
    maintenanceAttention,
    blockedItems,
    latestOpenWorkOrders: sortByDateDesc(
      workOrders.filter(isOpenWorkOrder),
      (wo) => wo.requestedAt || wo.createdAt
    )
      .slice(0, LIST_LIMIT)
      .map(projectWorkOrder),
    latestActiveMaintenance: sortByDateDesc(
      maintenance.filter(isMaintenanceBacklog),
      (row) => row.reportedAt
    )
      .slice(0, LIST_LIMIT)
      .map(projectMaintenanceRow),
  };
}
