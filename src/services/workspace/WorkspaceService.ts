import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  WORKSPACE_ACTIVITY_LIMIT,
  WORKSPACE_QUICK_ACTIONS,
  WORKSPACE_SCHEDULE_LIMIT,
} from "@/modules/workspace/constants";
import type {
  WorkspaceActivityItem,
  WorkspaceScheduleItem,
  WorkspaceSnapshot,
  WorkspaceWorkSummary,
} from "@/modules/workspace/types";
import { isSameDay, labelize } from "@/modules/workspace/utils";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { UserService } from "@/services/users/UserService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";

const OPEN_WO = new Set(["open", "assigned", "in_progress", "on_hold"]);
const OPEN_INCIDENT = new Set([
  "reported",
  "triaged",
  "investigating",
  "contained",
]);
const OPEN_MAINTENANCE = new Set([
  "requested",
  "triaged",
  "scheduled",
  "in_progress",
  "on_hold",
]);

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
        (row) =>
          row.assignedToUserId === userId && OPEN_WO.has(row.status)
      )
    : [];
  const assignedIncidents = userId
    ? incidents.filter(
        (row) =>
          row.assignedToUserId === userId && OPEN_INCIDENT.has(row.status)
      )
    : [];
  const pendingMaintenance = userId
    ? maintenance.filter(
        (row) =>
          row.assignedToUserId === userId &&
          OPEN_MAINTENANCE.has(row.status)
      )
    : [];

  return [
    {
      id: "assigned-work-orders",
      label: "Assigned Work Orders",
      count: assignedWorkOrders.length,
      href: "/work-orders",
      emptyLabel: "You're all caught up.",
    },
    {
      id: "assigned-incidents",
      label: "Assigned Incidents",
      count: assignedIncidents.length,
      href: "/incidents",
      emptyLabel: "You're all caught up.",
    },
    {
      id: "pending-maintenance",
      label: "Pending Maintenance",
      count: pendingMaintenance.length,
      href: "/maintenance",
      emptyLabel: "You're all caught up.",
    },
    {
      id: "awaiting-approval",
      label: "Awaiting Approval",
      count: 0,
      href: "/work-orders",
      emptyLabel: "You're all caught up.",
    },
  ];
}

function buildSchedule(
  asOf: string,
  workOrders: WorkOrder[],
  incidents: Incident[],
  maintenance: Maintenance[]
): WorkspaceScheduleItem[] {
  const dueMaintenance = maintenance
    .filter(
      (row) =>
        OPEN_MAINTENANCE.has(row.status) && isSameDay(row.dueAt, asOf)
    )
    .map(
      (row): WorkspaceScheduleItem => ({
        id: `schedule-mnt-${row.id}`,
        module: "maintenance",
        entityId: row.id,
        title: row.title || row.id,
        meta: `Maintenance · ${labelize(row.priority)} · due today`,
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

  const reportedToday = incidents
    .filter((row) => isSameDay(row.reportedAt, asOf))
    .map(
      (row): WorkspaceScheduleItem => ({
        id: `schedule-inc-${row.id}`,
        module: "incidents",
        entityId: row.id,
        title: row.title || row.id,
        meta: `Incident · ${labelize(row.severity)} · reported today`,
        at: row.reportedAt || row.createdAt || asOf,
      })
    );

  return sortByDateDesc(
    [...dueMaintenance, ...dueWorkOrders, ...reportedToday],
    (item) => item.at
  ).slice(0, WORKSPACE_SCHEDULE_LIMIT);
}

function buildActivity(
  workOrders: WorkOrder[],
  incidents: Incident[],
  maintenance: Maintenance[]
): WorkspaceActivityItem[] {
  const items: WorkspaceActivityItem[] = [
    ...incidents.map((row) => ({
      id: `activity-inc-${row.id}`,
      kind: "incident_reported" as const,
      module: "incidents" as const,
      entityId: row.id,
      title: row.title || row.id,
      summary: "Incident reported",
      at: row.reportedAt || row.createdAt || "",
    })),
    ...maintenance.map((row) => ({
      id: `activity-mnt-${row.id}`,
      kind: "maintenance_requested" as const,
      module: "maintenance" as const,
      entityId: row.id,
      title: row.title || row.id,
      summary: "Maintenance requested",
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
  ].filter((item) => Boolean(item.at));

  return sortByDateDesc(items, (item) => item.at).slice(
    0,
    WORKSPACE_ACTIVITY_LIMIT
  );
}

/**
 * Workspace Home composition service.
 * Aggregates only data needed for "What should I do today?"
 * Must not call DashboardService / ReportingService.
 */
export const WorkspaceService = {
  async getWorkspace(): Promise<WorkspaceSnapshot> {
    const asOf = new Date().toISOString();

    const [currentUser, workOrdersPage, incidentsPage, maintenancePage] =
      await Promise.all([
        UserService.getCurrentUser().catch(() => null),
        WorkOrderService.listWorkOrders({ page: 1, pageSize: 50 }).catch(
          () => ({ data: [] as WorkOrder[] })
        ),
        IncidentService.listIncidents({ page: 1, pageSize: 50 }).catch(
          () => ({ data: [] as Incident[] })
        ),
        MaintenanceService.listMaintenance({ page: 1, pageSize: 50 }).catch(
          () => ({ data: [] as Maintenance[] })
        ),
      ]);

    const workOrders = workOrdersPage.data ?? [];
    const incidents = incidentsPage.data ?? [];
    const maintenance = maintenancePage.data ?? [];
    const userId = currentUser?.id;

    return {
      asOf,
      currentUser: {
        id: currentUser?.id,
        name: currentUser?.name,
      },
      quickActions: WORKSPACE_QUICK_ACTIONS,
      myWork: buildMyWork(userId, workOrders, incidents, maintenance),
      schedule: buildSchedule(asOf, workOrders, incidents, maintenance),
      activity: buildActivity(workOrders, incidents, maintenance),
    };
  },
};

export type IWorkspaceService = typeof WorkspaceService;
