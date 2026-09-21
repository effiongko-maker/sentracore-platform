import type { Asset } from "@/modules/assets/types";
import type { Facility } from "@/modules/facilities/types";
import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { User } from "@/modules/users/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  isActiveEntityStatus,
  isOpenIncidentStatus,
  isCriticalSeverity,
  isHighOrCriticalPriority,
  isMaintenanceBacklogStatus,
  isOnHoldStatus,
  isOpenWorkOrderStatus,
  isOperationalAssetStatus,
  isPoorCondition,
  normalizeToken,
  toIsoUtc,
} from "./normalize";
import type { ReportingHealth, ReportingKpis } from "./types";

function dayKey(iso: string, asOf: string) {
  return toIsoUtc(iso || asOf).slice(0, 10);
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
  return isOpenWorkOrderStatus(wo.status);
}

export function isMaintenanceBacklog(row: Maintenance) {
  return isMaintenanceBacklogStatus(row.status);
}

export function isCriticalOpenIncident(incident: Incident) {
  return (
    isCriticalSeverity(incident.severity) &&
    isOpenIncidentStatus(incident.status)
  );
}

/** Live operational pressure — high/critical priority Work still in backlog. */
export function isCriticalOpenWork(row: Maintenance) {
  return isMaintenanceBacklog(row) && isHighOrCriticalPriority(row.priority);
}

function workOrderLinked(row: Maintenance) {
  return Boolean(row.workOrderId || (row.workOrderIds && row.workOrderIds.length));
}

/**
 * Authoritative KPI computation for the platform.
 * Dashboard, Reports, and snapshot rebuilds must all derive from this.
 */
export function computeReportingKpis(input: {
  asOf: string;
  facilities: Facility[];
  assets: Asset[];
  incidents: Incident[];
  maintenance: Maintenance[];
  workOrders: WorkOrder[];
  users: User[];
}): ReportingKpis {
  const asOf = toIsoUtc(input.asOf);
  const { facilities, assets, incidents, maintenance, workOrders, users } =
    input;

  const activeFacilities = facilities.filter((f) =>
    isActiveEntityStatus(f.status)
  ).length;
  const inactiveFacilities = facilities.filter((f) =>
    !isActiveEntityStatus(f.status)
  ).length;
  const activeAssets = assets.filter((a) =>
    isOperationalAssetStatus(a.status)
  ).length;
  const openWorkOrders = workOrders.filter(isOpenWorkOrder);
  const backlog = maintenance.filter(isMaintenanceBacklog);
  const criticalOpen = incidents.filter(isCriticalOpenIncident);
  const criticalWorkOpen = maintenance.filter(isCriticalOpenWork);

  // Availability is measured over assets whose status is KNOWN. An `unknown` status (a migrated historical asset
  // whose source states none) is unassessed, so it is excluded from the denominator; with nothing assessed the
  // figure is unknown (null), never 0%. A genuine `pending` asset is a known posture (not yet operational).
  const assessedAssets = assets.filter((a) => normalizeToken(a.status) !== "unknown");
  const assetsOperationalPercent =
    assessedAssets.length > 0
      ? Math.round((activeAssets / assessedAssets.length) * 100)
      : null;

  return {
    activeFacilities,
    inactiveFacilities,
    totalFacilities: facilities.length,
    activeAssets,
    totalAssets: assets.length,
    assetsOperationalPercent,
    assetsInPoorCondition: assets.filter((a) => isPoorCondition(a.condition))
      .length,
    activeWorkforce: users.filter((u) => isActiveEntityStatus(u.status)).length,
    totalUsers: users.length,
    openWorkOrders: openWorkOrders.length,
    // Migrated historical rows carry the IMPORT time as createdAt: that is not a business event and must never
    // read as "raised today".
    workOrdersCreatedToday: workOrders.filter(
      (wo) =>
        wo.recordOrigin !== "migrated_historical" &&
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
      (incident) => !String(incident.assignedToUserId || "").trim()
    ).length,
    incidentsNeedingWorkOrder: incidents.filter((incident) => {
      const requires =
        incident.requiresWorkOrder === true ||
        normalizeToken(incident.requiresWorkOrder) === "true";
      return (
        isOpenIncidentStatus(incident.status) &&
        requires &&
        !String(incident.workOrderId || "").trim()
      );
    }).length,
    criticalWork: criticalWorkOpen.length,
    criticalWorkUnassigned: criticalWorkOpen.filter(
      (row) => !String(row.assignedToUserId || "").trim()
    ).length,
    workNeedingWorkOrder: maintenance.filter((row) => {
      const requires =
        row.requiresWorkOrder === true ||
        normalizeToken(row.requiresWorkOrder) === "true";
      return isMaintenanceBacklog(row) && requires && !workOrderLinked(row);
    }).length,
    maintenanceBacklog: backlog.length,
    overdueMaintenance: backlog.filter((row) => isBeforeDay(row.dueAt, asOf))
      .length,
    maintenanceOnHold: maintenance.filter((row) => isOnHoldStatus(row.status))
      .length,
    workOrdersOnHold: workOrders.filter((wo) => isOnHoldStatus(wo.status))
      .length,
    assetsConditionUnknown: assets.filter((a) => normalizeToken(a.condition) === "unknown").length,
    workLifecycleUnknown:
      maintenance.filter((row) => normalizeToken(row.status) === "unknown").length +
      workOrders.filter((wo) => normalizeToken(wo.status) === "unknown").length,
  };
}

export function computeReportingHealth(kpis: ReportingKpis): ReportingHealth {
  let score = 100;

  score -= Math.min(40, kpis.criticalWork * 15);
  score -= Math.min(25, kpis.overdueWorkOrders * 5);
  score -= Math.min(20, kpis.overdueMaintenance * 4);
  score -= Math.min(10, kpis.assetsInPoorCondition * 2);
  score -= Math.min(10, kpis.workNeedingWorkOrder * 3);

  score = Math.max(0, Math.min(100, score));

  const band =
    score >= 80 ? "healthy" : score >= 55 ? "watch" : "critical";

  const summary =
    band === "healthy"
      ? "Here's what's happening across your facilities today."
      : band === "watch"
        ? "Some items need attention before end of day."
        : "Critical pressure detected — review critical work and overdue jobs.";

  return { band, score, summary };
}

/** Live contextual labels for KPI cards — never invents values. */
export function kpiInsightLabels(kpis: ReportingKpis) {
  // Historical records with no recorded lifecycle are neither open nor closed: a zero must say what it excludes.
  const unrecorded = kpis.workLifecycleUnknown ?? 0;
  const zeroOpen = (calm: string) =>
    unrecorded > 0 ? `None recorded open (${unrecorded} with no recorded status)` : calm;
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
            : "Operational status not recorded",

    activeWorkforce:
      kpis.totalUsers === 0
        ? "No users in directory"
        : kpis.activeWorkforce === kpis.totalUsers
          ? "All users active"
          : `${kpis.activeWorkforce} of ${kpis.totalUsers} active`,

    openWorkOrders:
      kpis.openWorkOrders === 0
        ? zeroOpen("Nothing requiring attention")
        : kpis.workOrdersCreatedToday > 0
          ? `${kpis.workOrdersCreatedToday} created today`
          : kpis.overdueWorkOrders > 0
            ? `${kpis.overdueWorkOrders} overdue`
            : kpis.workOrdersDueToday > 0
              ? `${kpis.workOrdersDueToday} due today`
              : "No overdue work",

    criticalWork:
      kpis.criticalWork === 0
        ? unrecorded > 0
          ? `None recorded critical (${unrecorded} with no recorded status or priority)`
          : "No outstanding critical work"
        : kpis.criticalWorkUnassigned > 0
          ? `${kpis.criticalWorkUnassigned} awaiting assignment`
          : kpis.workNeedingWorkOrder > 0
            ? `${kpis.workNeedingWorkOrder} need a work order`
            : "Under active review",

    criticalIncidents:
      kpis.criticalIncidents === 0
        ? "No legacy critical incidents"
        : kpis.criticalIncidentsUnassigned > 0
          ? `${kpis.criticalIncidentsUnassigned} legacy unassigned`
          : kpis.incidentsNeedingWorkOrder > 0
            ? `${kpis.incidentsNeedingWorkOrder} legacy need work order`
            : "Historical records only",

    maintenanceBacklog:
      kpis.maintenanceBacklog === 0
        ? zeroOpen("All clear")
        : kpis.overdueMaintenance > 0
          ? `${kpis.overdueMaintenance} overdue`
          : kpis.maintenanceOnHold > 0
            ? `${kpis.maintenanceOnHold} on hold`
            : "No overdue work",
  };
}
