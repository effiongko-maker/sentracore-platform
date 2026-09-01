import type { Approval } from "@/modules/approvals/types";
import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  WORKSPACE_ACTIVITY_LIMIT,
  WORKSPACE_QUICK_ACTIONS,
  WORKSPACE_SCHEDULE_LIMIT,
} from "@/modules/workspace/constants";
import {
  buildAttentionModel,
  countCriticalWork,
  countLegacyCriticalIncidents,
} from "@/modules/workspace/attention";
import type {
  WorkspaceActivityItem,
  WorkspaceScheduleItem,
  WorkspaceSnapshot,
  WorkspaceWorkSummary,
  OperationalState,
  OrganisationalPulse,
  AttentionModel,
} from "@/modules/workspace/types";
import { isSameDay, labelize } from "@/modules/workspace/utils";
import { ApprovalService } from "@/services/approvals/ApprovalService";
import { FacilityService } from "@/services/facilities/FacilityService";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { loadAllPages } from "@/services/reporting/loadAllPages";
import { UserService } from "@/services/users/UserService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import {
  ACTIVE_INCIDENT_STATUSES,
  ACTIVE_MAINTENANCE_STATUSES,
  WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES,
  deriveOperationalWorkloadMaps,
} from "@/lib/operational/workload";

const OPEN_WO = WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES;
const OPEN_INCIDENT = ACTIVE_INCIDENT_STATUSES;
const OPEN_MAINTENANCE = ACTIVE_MAINTENANCE_STATUSES;

function sortByDateDesc<T>(
  rows: T[],
  getDate: (row: T) => string | undefined
): T[] {
  return [...rows].sort((a, b) => {
    const left = getDate(a) || "";
    const right = getDate(b) || "";
    return right.localeCompare(left);
  });
}

function buildMyWork(
  userId: string | undefined,
  workOrders: WorkOrder[],
  incidents: Incident[],
  maintenance: Maintenance[]
): WorkspaceWorkSummary[] {
  const assignedWorkOrders = userId
    ? workOrders.filter(
        (row) => row.assignedToUserId === userId && OPEN_WO.has(row.status)
      )
    : [];
  const assignedWork = userId
    ? maintenance.filter(
        (row) =>
          row.assignedToUserId === userId && OPEN_MAINTENANCE.has(row.status)
      )
    : [];
  const assignedLegacyIncidents = userId
    ? incidents.filter(
        (row) =>
          row.assignedToUserId === userId && OPEN_INCIDENT.has(row.status)
      )
    : [];

  const rows: WorkspaceWorkSummary[] = [
    {
      id: "assigned-work",
      label: "Assigned Work",
      count: assignedWork.length,
      href: "/work",
      emptyLabel: "You're all caught up.",
    },
    {
      id: "assigned-work-orders",
      label: "Assigned Work Orders",
      count: assignedWorkOrders.length,
      href: "/work-orders",
      emptyLabel: "You're all caught up.",
    },
  ];

  if (assignedLegacyIncidents.length > 0) {
    rows.push({
      id: "assigned-legacy-incidents",
      label: "Legacy Incidents Assigned",
      count: assignedLegacyIncidents.length,
      href: "/incidents",
      emptyLabel: "You're all caught up.",
    });
  }

  return rows;
}

function buildSchedule(
  asOf: string,
  workOrders: WorkOrder[],
  incidents: Incident[],
  maintenance: Maintenance[]
): WorkspaceScheduleItem[] {
  const dueWork = maintenance
    .filter(
      (row) => OPEN_MAINTENANCE.has(row.status) && isSameDay(row.dueAt, asOf)
    )
    .map(
      (row): WorkspaceScheduleItem => ({
        id: `schedule-mnt-${row.id}`,
        module: "work",
        entityId: row.id,
        title: row.title || row.id,
        meta: `Work · ${labelize(row.priority)} · due today`,
        at: row.dueAt || row.reportedAt || asOf,
      })
    );

  const dueWorkOrders = workOrders
    .filter((row) => OPEN_WO.has(row.status) && isSameDay(row.dueAt, asOf))
    .map(
      (row): WorkspaceScheduleItem => ({
        id: `schedule-wo-${row.id}`,
        module: "work-orders",
        entityId: row.id,
        title: row.title || row.id,
        meta: `Work Order · ${labelize(row.priority)} · scheduled today`,
        at: row.dueAt || row.requestedAt || asOf,
      })
    );

  const legacyReportedToday = incidents
    .filter((row) => isSameDay(row.reportedAt, asOf))
    .map(
      (row): WorkspaceScheduleItem => ({
        id: `schedule-inc-${row.id}`,
        module: "incidents",
        entityId: row.id,
        title: row.title || row.id,
        meta: `Legacy incident · ${labelize(row.severity)} · reported today`,
        at: row.reportedAt || row.createdAt || asOf,
      })
    );

  return sortByDateDesc(
    [...dueWork, ...dueWorkOrders, ...legacyReportedToday],
    (item) => item.at
  ).slice(0, WORKSPACE_SCHEDULE_LIMIT);
}

function buildActivity(
  workOrders: WorkOrder[],
  incidents: Incident[],
  maintenance: Maintenance[]
): WorkspaceActivityItem[] {
  const items: WorkspaceActivityItem[] = [
    ...maintenance.map((row) => ({
      id: `activity-mnt-${row.id}`,
      kind: "maintenance_requested" as const,
      module: "work" as const,
      entityId: row.id,
      title: row.title || row.id,
      summary: "Work requested",
      at: row.reportedAt || row.createdAt || "",
    })),
    ...workOrders.map((row) => ({
      id: `activity-wo-${row.id}`,
      kind: "work_order_created" as const,
      module: "work-orders" as const,
      entityId: row.id,
      title: row.title || row.id,
      summary: "Work Order created",
      at: row.createdAt || row.requestedAt || "",
    })),
    ...incidents.map((row) => ({
      id: `activity-inc-${row.id}`,
      kind: "incident_reported" as const,
      module: "incidents" as const,
      entityId: row.id,
      title: row.title || row.id,
      summary: "Legacy incident recorded",
      at: row.reportedAt || row.createdAt || "",
    })),
  ].filter((item) => Boolean(item.at));

  return sortByDateDesc(items, (item) => item.at).slice(
    0,
    WORKSPACE_ACTIVITY_LIMIT
  );
}

function buildPulse(
  incidents: Incident[],
  maintenance: Maintenance[],
  workOrders: WorkOrder[],
  activity: WorkspaceActivityItem[]
): OrganisationalPulse {
  const openWork = maintenance.filter((r) => OPEN_MAINTENANCE.has(r.status))
    .length;
  const criticalWork = countCriticalWork(maintenance);
  const openWorkOrders = workOrders.filter((r) => OPEN_WO.has(r.status)).length;
  const legacyOpenIncidents = incidents.filter((r) =>
    OPEN_INCIDENT.has(r.status)
  ).length;
  const legacyCriticalIncidents = countLegacyCriticalIncidents(incidents);

  return {
    openWork,
    criticalWork,
    openWorkOrders,
    openMaintenance: openWork,
    legacyOpenIncidents,
    legacyCriticalIncidents,
    recentActivity: activity.length,
  };
}

function buildOperationalState(
  pulse: OrganisationalPulse,
  attention: AttentionModel
): OperationalState {
  const hasCriticalWork = pulse.criticalWork > 0;
  const hasCriticalAttention = attention.criticalCount > 0;

  if (hasCriticalWork || hasCriticalAttention) {
    let statement: string;
    if (hasCriticalWork && hasCriticalAttention) {
      const workPart =
        pulse.criticalWork === 1
          ? "One critical work item"
          : `${pulse.criticalWork} critical work items`;
      const attentionPart =
        attention.criticalCount === 1
          ? "one critical attention matter"
          : `${attention.criticalCount} critical attention matters`;
      statement = `${workPart} and ${attentionPart} require intervention.`;
    } else if (hasCriticalWork) {
      statement =
        pulse.criticalWork === 1
          ? "One critical work item requires intervention."
          : `${pulse.criticalWork} critical work items require intervention.`;
    } else {
      statement =
        attention.criticalCount === 1
          ? "One critical attention matter requires intervention."
          : `${attention.criticalCount} critical attention matters require intervention.`;
    }

    const subtext =
      attention.total > 0
        ? attention.total === 1
          ? "1 matter in the attention queue."
          : `${attention.total} matters in the attention queue.`
        : `${pulse.openWork} open work item${pulse.openWork === 1 ? "" : "s"} across the operation.`;

    return {
      tone: "critical",
      statement,
      subtext,
    };
  }

  if (attention.total > 0) {
    return {
      tone: "attention",
      statement:
        attention.total === 1
          ? "One operational matter requires attention."
          : `${attention.total} operational matters require attention.`,
      subtext: "Review overdue work, approvals, and assignments below.",
    };
  }

  const pressure = pulse.openWork + pulse.openWorkOrders;
  if (pressure >= 12 || pulse.openWork >= 5) {
    return {
      tone: "attention",
      statement: "Operational pressure is increasing across the organisation.",
      subtext: `${pulse.openWork} work items and ${pulse.openWorkOrders} work orders in flow.`,
    };
  }

  const attentionAreas =
    (pulse.openWork > 4 ? 1 : 0) + (pulse.openWorkOrders > 4 ? 1 : 0);

  if (attentionAreas > 0) {
    return {
      tone: "attention",
      statement:
        attentionAreas === 1
          ? "The operation is mostly stable, with one area requiring attention."
          : "The operation is stable, with a few areas requiring attention.",
      subtext: "Open modules below to continue scheduled work.",
    };
  }

  return {
    tone: "stable",
    statement: "The operation is stable.",
    subtext: "No matters require intervention right now.",
  };
}

async function loadDomainLists(): Promise<{
  workOrders: { ok: boolean; data: WorkOrder[] };
  incidents: { ok: boolean; data: Incident[] };
  maintenance: { ok: boolean; data: Maintenance[] };
  approvals: { ok: boolean; data: Approval[] };
  facilities: { ok: boolean; data: Array<{ id: string; name: string }> };
}> {
  const [workOrders, incidents, maintenance, approvals, facilities] =
    await Promise.all([
      loadAllPages((page, pageSize) =>
        WorkOrderService.listWorkOrders({ page, pageSize })
      )
        .then((data) => ({ ok: true as const, data }))
        .catch(() => ({ ok: false as const, data: [] as WorkOrder[] })),
      loadAllPages((page, pageSize) =>
        IncidentService.listIncidents({ page, pageSize })
      )
        .then((data) => ({ ok: true as const, data }))
        .catch(() => ({ ok: false as const, data: [] as Incident[] })),
      loadAllPages((page, pageSize) =>
        MaintenanceService.listMaintenance({ page, pageSize })
      )
        .then((data) => ({ ok: true as const, data }))
        .catch(() => ({ ok: false as const, data: [] as Maintenance[] })),
      loadAllPages((page, pageSize) =>
        ApprovalService.listApprovals({ page, pageSize })
      )
        .then((data) => ({ ok: true as const, data }))
        .catch(() => ({ ok: false as const, data: [] as Approval[] })),
      FacilityService.listFacilities({ page: 1, pageSize: 200 })
        .then((page) => ({
          ok: true as const,
          data: page.data ?? ([] as Array<{ id: string; name: string }>),
        }))
        .catch(() => ({
          ok: false as const,
          data: [] as Array<{ id: string; name: string }>,
        })),
    ]);

  return { workOrders, incidents, maintenance, approvals, facilities };
}

/**
 * Home composition service.
 * Aggregates only data needed for personal daily work.
 * Must not call DashboardService / ReportingService.
 */
export const WorkspaceService = {
  async getWorkspace(): Promise<WorkspaceSnapshot> {
    const asOf = new Date().toISOString();

    const [currentUser, lists, catalogUsers] = await Promise.all([
      UserService.getCurrentUser().catch(() => null),
      loadDomainLists(),
      UserService.fetchUsersCatalog().catch(() => []),
    ]);

    const workOrders = lists.workOrders.data;
    const incidents = lists.incidents.data;
    const maintenance = lists.maintenance.data;
    const approvals = lists.approvals.data;
    const coreFailed =
      !lists.workOrders.ok ||
      !lists.incidents.ok ||
      !lists.maintenance.ok;

    const userId = currentUser?.id;
    const facilityNameById = new Map(
      lists.facilities.data.map((facility) => [facility.id, facility.name])
    );
    const userNameById = new Map(
      catalogUsers.map((user) => [user.id, user.name || user.id])
    );
    const workloadMaps = deriveOperationalWorkloadMaps({
      workOrders,
      maintenance,
      incidents,
    });
    const activity = buildActivity(workOrders, incidents, maintenance);
    const pulse = buildPulse(incidents, maintenance, workOrders, activity);
    const attention = buildAttentionModel({
      asOf,
      currentUserId: userId,
      incidents,
      workOrders,
      maintenance,
      approvals,
      workloadByUserId: workloadMaps.byUserId,
      userNameById,
      facilityNameById,
    });

    const operationalState: OperationalState = coreFailed
      ? {
          tone: "degraded",
          statement: "Operational overview could not be fully loaded.",
          subtext:
            "Some live operational data is temporarily unavailable. Retry this page or open a module directly.",
        }
      : buildOperationalState(pulse, attention);

    return {
      asOf,
      currentUser: {
        id: currentUser?.id,
        name: currentUser?.name,
      },
      operationalState,
      attention,
      pulse,
      quickActions: WORKSPACE_QUICK_ACTIONS,
      myWork: buildMyWork(userId, workOrders, incidents, maintenance),
      schedule: buildSchedule(asOf, workOrders, incidents, maintenance),
      activity,
    };
  },
};

export type IWorkspaceService = typeof WorkspaceService;
