import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  isCriticalOpenIncident,
  isCriticalOpenWork,
  isMaintenanceBacklog,
  isOpenWorkOrder,
} from "./kpis";
import {
  isHighOrCriticalPriority,
  isOnHoldStatus,
  normalizeToken,
  toIsoUtc,
} from "./normalize";
import type { ReportingListItem, ReportingProjections } from "./types";

const LIST_LIMIT = 5;

function labelize(value?: string) {
  if (!value) return "";
  return normalizeToken(value)
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function toneFromPriority(priority?: string): ReportingListItem["tone"] {
  const token = normalizeToken(priority);
  if (token === "critical") return "danger";
  if (token === "high") return "warning";
  if (token === "medium") return "info";
  return "neutral";
}

/** Newest first; stable secondary key for deterministic ordering. */
function sortByDateDesc<T>(
  rows: T[],
  getDate: (row: T) => string | undefined,
  getTieBreaker: (row: T) => string
) {
  return [...rows].sort((a, b) => {
    const left = toIsoUtc(getDate(a) || "", "1970-01-01T00:00:00.000Z");
    const right = toIsoUtc(getDate(b) || "", "1970-01-01T00:00:00.000Z");
    const byDate = right.localeCompare(left);
    if (byDate !== 0) return byDate;
    return getTieBreaker(a).localeCompare(getTieBreaker(b));
  });
}

function isOverdueWorkOrder(wo: WorkOrder, asOf: string) {
  if (!isOpenWorkOrder(wo) || !wo.dueAt) return false;
  return toIsoUtc(wo.dueAt).slice(0, 10) < toIsoUtc(asOf).slice(0, 10);
}

function isOverdueMaintenance(row: Maintenance, asOf: string) {
  if (!isMaintenanceBacklog(row) || !row.dueAt) return false;
  return toIsoUtc(row.dueAt).slice(0, 10) < toIsoUtc(asOf).slice(0, 10);
}

function projectWorkOrder(wo: WorkOrder): ReportingListItem {
  return {
    module: "work-orders",
    entityId: wo.id,
    title: wo.title || wo.id,
    status: normalizeToken(wo.status),
    priority: normalizeToken(wo.priority),
    facilityId: wo.facilityId,
    meta: `${labelize(wo.priority)} · ${labelize(wo.status)}`,
    reportedAt: wo.requestedAt ? toIsoUtc(wo.requestedAt) : wo.requestedAt,
    tone: toneFromPriority(wo.priority),
  };
}

function projectMaintenanceRow(row: Maintenance): ReportingListItem {
  return {
    module: "maintenance",
    entityId: row.id,
    title: row.title || row.id,
    status: normalizeToken(row.status),
    priority: normalizeToken(row.priority),
    facilityId: row.facilityId,
    meta: `${labelize(row.priority)} · ${labelize(row.status)}`,
    reportedAt: row.reportedAt ? toIsoUtc(row.reportedAt) : row.reportedAt,
    tone: toneFromPriority(row.priority),
  };
}

function projectIncident(incident: Incident): ReportingListItem {
  return {
    module: "incidents",
    entityId: incident.id,
    title: incident.title || incident.id,
    status: normalizeToken(incident.status),
    priority: normalizeToken(incident.severity),
    facilityId: incident.facilityId,
    meta: `${labelize(incident.severity)} · ${labelize(incident.status)}`,
    reportedAt: incident.reportedAt
      ? toIsoUtc(incident.reportedAt)
      : incident.reportedAt,
    tone: toneFromPriority(incident.severity),
  };
}

export function computeReportingProjections(input: {
  asOf: string;
  incidents: Incident[];
  maintenance: Maintenance[];
  workOrders: WorkOrder[];
}): ReportingProjections {
  const asOf = toIsoUtc(input.asOf);
  const { incidents, maintenance, workOrders } = input;

  const overdueWorkOrders = sortByDateDesc(
    workOrders.filter((wo) => isOverdueWorkOrder(wo, asOf)),
    (wo) => wo.dueAt || wo.requestedAt || wo.createdAt,
    (wo) => wo.id
  )
    .slice(0, LIST_LIMIT)
    .map(projectWorkOrder);

  const maintenanceAttention = sortByDateDesc(
    maintenance.filter(
      (row) =>
        isOverdueMaintenance(row, asOf) ||
        isOnHoldStatus(row.status) ||
        isHighOrCriticalPriority(row.priority)
    ),
    (row) => row.dueAt || row.reportedAt || row.createdAt,
    (row) => row.id
  )
    .slice(0, LIST_LIMIT)
    .map(projectMaintenanceRow);

  const blockedItems = sortByDateDesc(
    [
      ...workOrders.filter((wo) => isOnHoldStatus(wo.status)).map(projectWorkOrder),
      ...maintenance
        .filter((row) => isOnHoldStatus(row.status))
        .map(projectMaintenanceRow),
    ],
    (item) => item.reportedAt,
    (item) => item.entityId
  ).slice(0, LIST_LIMIT);

  return {
    criticalIncidents: sortByDateDesc(
      incidents.filter(isCriticalOpenIncident),
      (incident) => incident.reportedAt || incident.createdAt,
      (incident) => incident.id
    )
      .slice(0, LIST_LIMIT)
      .map(projectIncident),
    criticalWork: sortByDateDesc(
      maintenance.filter(isCriticalOpenWork),
      (row) => row.dueAt || row.reportedAt || row.createdAt,
      (row) => row.id
    )
      .slice(0, LIST_LIMIT)
      .map(projectMaintenanceRow),
    overdueWorkOrders,
    maintenanceAttention,
    blockedItems,
    latestOpenWorkOrders: sortByDateDesc(
      workOrders.filter(isOpenWorkOrder),
      (wo) => wo.requestedAt || wo.createdAt,
      (wo) => wo.id
    )
      .slice(0, LIST_LIMIT)
      .map(projectWorkOrder),
    latestActiveMaintenance: sortByDateDesc(
      maintenance.filter(isMaintenanceBacklog),
      (row) => row.reportedAt || row.createdAt,
      (row) => row.id
    )
      .slice(0, LIST_LIMIT)
      .map(projectMaintenanceRow),
  };
}
