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

  const activeFacilities = facilities.filter((f) => f.status === "active").length;
  const activeAssets = assets.filter((a) => a.status === "active").length;
  const openWorkOrders = workOrders.filter(isOpenWorkOrder);
  const backlog = maintenance.filter(isMaintenanceBacklog);
  const criticalOpen = incidents.filter(isCriticalOpenIncident);

  const assetsOperationalPercent =
    assets.length > 0
      ? Math.round((activeAssets / assets.length) * 100)
      : null;

  return {
    activeFacilities,
    inactiveFacilities: Math.max(0, facilities.length - activeFacilities),
    totalFacilities: facilities.length,
    activeAssets,
    totalAssets: assets.length,
    assetsOperationalPercent,
    assetsInPoorCondition: assets.filter((a) => a.condition === "poor").length,
    activeWorkforce: users.filter((u) => u.status === "active").length,
    totalUsers: users.length,
    openWorkOrders: openWorkOrders.length,
    workOrdersCreatedToday: workOrders.filter((wo) =>
      isSameDay(wo.createdAt || wo.requestedAt, asOf)
    ).length,
    workOrdersDueToday: openWorkOrders.filter((wo) =>
      isSameDay(wo.dueAt, asOf)
    ).length,
    overdueWorkOrders: openWorkOrders.filter((wo) =>
      isBeforeDay(wo.dueAt, asOf)
    ).length,
    criticalIncidents: criticalOpen.length,
    criticalIncidentsUnassigned: criticalOpen.filter(
      (incident) => !incident.assignedToUserId
    ).length,
    incidentsNeedingWorkOrder: incidents.filter(
      (incident) =>
        !CLOSED_INCIDENT.has(incident.status) &&
        incident.requiresWorkOrder === true &&
        !incident.workOrderId
    ).length,
    maintenanceBacklog: backlog.length,
    overdueMaintenance: backlog.filter((row) => isBeforeDay(row.dueAt, asOf))
      .length,
    maintenanceOnHold: maintenance.filter((row) => row.status === "on_hold")
      .length,
    workOrdersOnHold: workOrders.filter((wo) => wo.status === "on_hold")
      .length,
  };
}

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
      ? "Here's what's happening across your facilities today."
      : band === "watch"
        ? "Some items need attention before end of day."
        : "Critical pressure detected — review open incidents and overdue work.";

  return { band, score, summary };
}

/** Live contextual labels for KPI cards — never invents values. */
export function kpiInsightLabels(kpis: ReportingKpis) {
  return {
    activeFacilities:
      kpis.totalFacilities === 0
        ? "No facilities in scope"
        : kpis.inactiveFacilities === 0
          ? "All facilities operational"
          : kpis.inactiveFacilities === 1
            ? "1 facility inactive"
            : `${kpis.inactiveFacilities} facilities inactive`,

    activeAssets:
      kpis.totalAssets === 0
        ? "No assets in scope"
        : kpis.assetsOperationalPercent != null
          ? `${kpis.assetsOperationalPercent}% operational`
          : kpis.assetsInPoorCondition > 0
            ? `${kpis.assetsInPoorCondition} in poor condition`
            : "All clear",

    activeWorkforce:
      kpis.totalUsers === 0
        ? "No users in directory"
        : kpis.activeWorkforce === kpis.totalUsers
          ? "All users active"
          : `${kpis.activeWorkforce} of ${kpis.totalUsers} active`,

    openWorkOrders:
      kpis.openWorkOrders === 0
        ? "Nothing requiring attention"
        : kpis.workOrdersCreatedToday > 0
          ? `${kpis.workOrdersCreatedToday} created today`
          : kpis.overdueWorkOrders > 0
            ? `${kpis.overdueWorkOrders} overdue`
            : kpis.workOrdersDueToday > 0
              ? `${kpis.workOrdersDueToday} due today`
              : "No overdue work",

    criticalIncidents:
      kpis.criticalIncidents === 0
        ? "No outstanding issues"
        : kpis.criticalIncidentsUnassigned > 0
          ? `${kpis.criticalIncidentsUnassigned} awaiting assignment`
          : kpis.incidentsNeedingWorkOrder > 0
            ? `${kpis.incidentsNeedingWorkOrder} need a work order`
            : "Under active review",

    maintenanceBacklog:
      kpis.maintenanceBacklog === 0
        ? "All clear"
        : kpis.overdueMaintenance > 0
          ? `${kpis.overdueMaintenance} overdue`
          : kpis.maintenanceOnHold > 0
            ? `${kpis.maintenanceOnHold} on hold`
            : "No overdue work",
  };
}
