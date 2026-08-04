import type { Asset } from "@/modules/assets/types";
import type { Facility } from "@/modules/facilities/types";
import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { User } from "@/modules/users/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import type { ReportingHealth, ReportingKpis } from "./types";

const OPEN_WO = new Set(["open", "assigned", "in_progress", "on_hold"]);
const BACKLOG_MNT = new Set([
  "requested",
  "triaged",
  "scheduled",
  "in_progress",
  "on_hold",
]);
const CLOSED_INCIDENT = new Set(["resolved", "closed", "cancelled"]);

function dayKey(iso: string, asOf: string) {
  const value = iso || asOf;
  return value.slice(0, 10);
}

function isBeforeDay(iso: string | undefined, asOf: string) {
  if (!iso) return false;
  return dayKey(iso, asOf) < dayKey(asOf, asOf);
}

function isSameDay(iso: string | undefined, asOf: string) {
  if (!iso) return false;
  return dayKey(iso, asOf) === dayKey(asOf, asOf);
}

export function isOpenWorkOrder(wo: WorkOrder) {
  return OPEN_WO.has(wo.status);
}

export function isMaintenanceBacklog(row: Maintenance) {
  return BACKLOG_MNT.has(row.status);
}

export function isCriticalOpenIncident(incident: Incident) {
  return (
    incident.severity === "critical" && !CLOSED_INCIDENT.has(incident.status)
  );
}

export function computeReportingKpis(input: {
  asOf: string;
  facilities: Facility[];
  assets: Asset[];
  incidents: Incident[];
  maintenance: Maintenance[];
  workOrders: WorkOrder[];
  users: User[];
}): ReportingKpis {
  const { asOf, facilities, assets, incidents, maintenance, workOrders, users } =
    input;

  const openWorkOrders = workOrders.filter(isOpenWorkOrder);
  const backlog = maintenance.filter(isMaintenanceBacklog);

  return {
    activeFacilities: facilities.filter((f) => f.status === "active").length,
    activeAssets: assets.filter((a) => a.status === "active").length,
    openWorkOrders: openWorkOrders.length,
    workOrdersDueToday: openWorkOrders.filter((wo) =>
      isSameDay(wo.dueAt, asOf)
    ).length,
    overdueWorkOrders: openWorkOrders.filter((wo) =>
      isBeforeDay(wo.dueAt, asOf)
    ).length,
    criticalIncidents: incidents.filter(isCriticalOpenIncident).length,
    maintenanceBacklog: backlog.length,
    overdueMaintenance: backlog.filter((row) => isBeforeDay(row.dueAt, asOf))
      .length,
    activeWorkforce: users.filter((u) => u.status === "active").length,
    assetsInPoorCondition: assets.filter((a) => a.condition === "poor").length,
    incidentsNeedingWorkOrder: incidents.filter(
      (incident) =>
        !CLOSED_INCIDENT.has(incident.status) &&
        incident.requiresWorkOrder === true &&
        !incident.workOrderId
    ).length,
  };
}

/** Composite health from live pressures — recomputed each load, never stored. */
export function computeReportingHealth(kpis: ReportingKpis): ReportingHealth {
  let score = 100;

  score -= Math.min(40, kpis.criticalIncidents * 15);
  score -= Math.min(25, kpis.overdueWorkOrders * 5);
  score -= Math.min(20, kpis.overdueMaintenance * 4);
  score -= Math.min(10, kpis.assetsInPoorCondition * 2);
  score -= Math.min(10, kpis.incidentsNeedingWorkOrder * 3);

  score = Math.max(0, Math.min(100, score));

  const band =
    score >= 80 ? "healthy" : score >= 55 ? "watch" : "critical";

  const summary =
    band === "healthy"
      ? "Operations look stable for today."
      : band === "watch"
        ? "Some items need attention before end of day."
        : "Critical pressure detected — review open incidents and overdue work.";

  return { band, score, summary };
}
