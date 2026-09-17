import type { Approval } from "@/modules/approvals/types";
import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  WORKSPACE_ACTIVITY_LIMIT,
  WORKSPACE_HOME_DOMAIN_TIMEOUT_MS,
  WORKSPACE_HOME_POOL_SIZE,
  WORKSPACE_QUICK_ACTIONS,
  WORKSPACE_SCHEDULE_LIMIT,
} from "@/modules/workspace/constants";
import {
  buildAttentionModel,
  countLegacyCriticalIncidents,
} from "@/modules/workspace/attention";
import { buildOperationalPictureMetrics } from "@/modules/workspace/operationalPicture";
import type {
  WorkspaceActivityItem,
  WorkspaceScheduleItem,
  WorkspaceSnapshot,
  WorkspaceWorkSummary,
  OperationalState,
  OrganisationalPulse,
  AttentionModel,
} from "@/modules/workspace/types";
import type { PaginatedResult } from "@/types";
import { isSameDay, labelize } from "@/modules/workspace/utils";
import { ApprovalService } from "@/services/approvals/ApprovalService";
import { FacilityService } from "@/services/facilities/FacilityService";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { UserService } from "@/services/users/UserService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { loadAllPages } from "@/services/reporting/loadAllPages";
import {
  ACTIVE_INCIDENT_STATUSES,
  ACTIVE_MAINTENANCE_STATUSES,
  WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES,
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
  incidents: Incident[] | null,
  maintenance: Maintenance[] | null,
  workOrders: WorkOrder[] | null,
  approvals: Approval[] | null,
  activity: WorkspaceActivityItem[],
  asOf: string,
  /** Exact register count from filtered getAll total; null when unavailable. */
  criticalWorkCount: number | null
): OrganisationalPulse {
  const openWork = maintenance
    ? maintenance.filter((r) => OPEN_MAINTENANCE.has(r.status)).length
    : null;
  const criticalWork = criticalWorkCount;
  const openWorkOrders = workOrders
    ? workOrders.filter((r) => OPEN_WO.has(r.status)).length
    : null;
  const legacyOpenIncidents = incidents
    ? incidents.filter((r) => OPEN_INCIDENT.has(r.status)).length
    : null;
  const legacyCriticalIncidents = incidents
    ? countLegacyCriticalIncidents(incidents)
    : null;

  return {
    openWork,
    criticalWork,
    openWorkOrders,
    openMaintenance: openWork,
    legacyOpenIncidents,
    legacyCriticalIncidents,
    recentActivity: activity.length,
    picture: buildOperationalPictureMetrics({
      asOf,
      criticalWork,
      maintenance,
      workOrders,
      approvals,
    }),
  };
}

function buildOperationalState(
  pulse: OrganisationalPulse,
  attention: AttentionModel
): OperationalState {
  const criticalWork = pulse.criticalWork ?? 0;
  const openWork = pulse.openWork ?? 0;
  const openWorkOrders = pulse.openWorkOrders ?? 0;
  const hasCriticalWork = criticalWork > 0;
  const hasCriticalAttention = attention.criticalCount > 0;

  if (hasCriticalWork || hasCriticalAttention) {
    let statement: string;
    if (hasCriticalWork && hasCriticalAttention) {
      const workPart =
        criticalWork === 1
          ? "One critical work item"
          : `${criticalWork} critical work items`;
      const attentionPart =
        attention.criticalCount === 1
          ? "one critical attention matter"
          : `${attention.criticalCount} critical attention matters`;
      statement = `${workPart} and ${attentionPart} require intervention.`;
    } else if (hasCriticalWork) {
      statement =
        criticalWork === 1
          ? "One critical work item requires intervention."
          : `${criticalWork} critical work items require intervention.`;
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
        : `${openWork} open work item${openWork === 1 ? "" : "s"} across the operation.`;

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

  const pressure = openWork + openWorkOrders;
  if (pressure >= 12 || openWork >= 5) {
    return {
      tone: "attention",
      statement: "Operational pressure is increasing across the organisation.",
      subtext: `${openWork} work items and ${openWorkOrders} work orders in flow.`,
    };
  }

  const attentionAreas =
    (openWork > 4 ? 1 : 0) + (openWorkOrders > 4 ? 1 : 0);

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

type DomainResult<T> = { ok: boolean; data: T[] };

type OperationalMaintenanceWalkResult = DomainResult<Maintenance> & {
  criticalWork: number | null;
};

/** Exact filtered register total — never treat !ok as total 0 for KPIs. */
type DomainCountResult = { ok: boolean; total: number };

type CoreDomainLists = {
  workOrders: DomainResult<WorkOrder>;
  incidents: DomainResult<Incident>;
  maintenance: DomainResult<Maintenance>;
  /** Exact Critical Work register total (status=active, priority high|critical). */
  criticalWork: DomainCountResult;
};

/**
 * Parse Home `criticalWorkTotal` from a Maintenance list page.
 * Only a finite number counts — missing/non-numeric → null (KPI unavailable).
 * 0 is a valid exact total.
 */
export function parseHomeCriticalWorkTotal(raw: unknown): number | null {
  if (typeof raw !== "number" || !Number.isFinite(raw)) return null;
  return raw;
}

/**
 * Map one Home Maintenance list response into pool + Critical Work domain results.
 * Pool rows stay usable even when criticalWorkTotal is absent; Critical Work then
 * ok:false → pulse null (never 0, never sampled from the page rows).
 *
 * @internal Exported for Home settle verifies.
 */
export function mapHomeMaintenancePageResult(page: {
  data?: Maintenance[] | null;
  criticalWorkTotal?: unknown;
}): {
  maintenance: DomainResult<Maintenance>;
  criticalWork: DomainCountResult;
} {
  const data = page.data ?? [];
  const total = parseHomeCriticalWorkTotal(page.criticalWorkTotal);
  return {
    maintenance: { ok: true, data },
    criticalWork:
      total === null
        ? { ok: false, total: 0 }
        : { ok: true, total },
  };
}

/**
 * Complete active-Maintenance walk for authoritative Operational Picture data.
 * Page 1 also carries the exact Critical Work KPI; later pages only contribute
 * rows. The result is returned only after every advertised page succeeds.
 *
 * @internal Exported for Command Centre truthfulness verification.
 */
export async function loadOperationalMaintenancePages(
  listPage: (
    page: number,
    pageSize: number,
    includeCriticalWorkTotal: boolean
  ) => Promise<PaginatedResult<Maintenance>>,
  pageSize = WORKSPACE_HOME_POOL_SIZE
): Promise<{ data: Maintenance[]; criticalWork: number | null }> {
  let criticalWork: number | null = null;
  const data = await loadAllPages(async (page, size) => {
    const result = await listPage(page, size, page === 1);
    if (page === 1) {
      criticalWork = parseHomeCriticalWorkTotal(result.criticalWorkTotal);
    }
    return result;
  }, pageSize);

  return { data, criticalWork };
}

type NonCoreDomainLists = {
  approvals: DomainResult<Approval>;
  facilities: DomainResult<{ id: string; name: string }>;
};

type DomainLists = CoreDomainLists & NonCoreDomainLists;

type CurrentUserLite = {
  id?: string;
  name?: string;
  operationalUserId?: string | null;
} | null;

/**
 * Isolate a single domain fetch: reject OR timeout → caller-supplied failure.
 * On timeout, abort the underlying browser fetch so lingering requests do not
 * keep holding same-origin HTTP connections (Finance Home starvation).
 * Domain callers supply ok:false + empty data so Home can still compose a
 * degraded snapshot when a core domain is unavailable.
 */
function settleValue<T>(
  start: (signal: AbortSignal) => Promise<T>,
  failed: T,
  timeoutMs = WORKSPACE_HOME_DOMAIN_TIMEOUT_MS
): Promise<T> {
  return new Promise((resolve) => {
    let settled = false;
    const controller = new AbortController();

    const finish = (value: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      // Cancel the in-flight fetch; late resolve/reject must not overwrite.
      controller.abort();
      resolve(failed);
    }, timeoutMs);

    start(controller.signal).then(
      (value) => finish(value),
      () => finish(failed)
    );
  });
}

function settleDomain<T>(
  start: (signal: AbortSignal) => Promise<DomainResult<T>>,
  empty: T[],
  timeoutMs = WORKSPACE_HOME_DOMAIN_TIMEOUT_MS
): Promise<DomainResult<T>> {
  return settleValue(start, { ok: false, data: empty }, timeoutMs);
}

/**
 * Home Maintenance: one active-pool getAll that also returns exact Critical Work
 * (criticalWorkTotal counted on the full filtered active set before pagination).
 *
 * Critical Work KPI succeeds only when criticalWorkTotal is a finite number
 * (including 0). Missing/non-numeric → criticalWork ok:false → pulse null, while
 * pool rows remain available for Open Work / attention when the HTTP call itself
 * succeeded. Timeout/reject → both ok:false.
 */
function settleMaintenanceHome(
  poolSize: number,
  timeoutMs = WORKSPACE_HOME_DOMAIN_TIMEOUT_MS
): Promise<{
  maintenance: DomainResult<Maintenance>;
  criticalWork: DomainCountResult;
}> {
  const emptyMnt: Maintenance[] = [];
  const failed = {
    maintenance: { ok: false as const, data: emptyMnt },
    criticalWork: { ok: false as const, total: 0 },
  };

  return new Promise((resolve) => {
    let settled = false;
    const controller = new AbortController();

    const finish = (value: {
      maintenance: DomainResult<Maintenance>;
      criticalWork: DomainCountResult;
    }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      controller.abort();
      resolve(failed);
    }, timeoutMs);

    MaintenanceService.listMaintenance(
      {
        page: 1,
        pageSize: poolSize,
        status: "active",
        includeCriticalWorkTotal: true,
      },
      { signal: controller.signal }
    )
      .then((page) => finish(mapHomeMaintenancePageResult(page)))
      .catch(() => finish(failed));
  });
}

/**
 * Bounded Home domain pools — newest/active slices only.
 * Does not walk full operational registers (loadAllPages).
 *
 * Core for first paint: workOrders, incidents, maintenance.
 * Non-core: approvals (attention only), facilities (labels only) —
 * started only after core settles (see beginWorkspaceLoad).
 * Each arm already uses ok:false on failure; settleDomain adds the same for hangs.
 */
function startCoreDomainLists(): Promise<CoreDomainLists> {
  const pool = WORKSPACE_HOME_POOL_SIZE;
  const emptyWo: WorkOrder[] = [];
  const emptyInc: Incident[] = [];

  return Promise.all([
    settleDomain(
      (signal) =>
        WorkOrderService.listWorkOrders({ page: 1, pageSize: pool }, { signal })
          .then((page) => ({ ok: true as const, data: page.data ?? emptyWo }))
          .catch(() => ({ ok: false as const, data: emptyWo })),
      emptyWo
    ),
    settleDomain(
      (signal) =>
        IncidentService.listIncidents({ page: 1, pageSize: pool }, { signal })
          .then((page) => ({ ok: true as const, data: page.data ?? emptyInc }))
          .catch(() => ({ ok: false as const, data: emptyInc })),
      emptyInc
    ),
    // One Maintenance getAll: active pool rows + exact Critical Work total.
    settleMaintenanceHome(pool),
  ]).then(([workOrders, incidents, maintenanceHome]) => ({
    workOrders,
    incidents,
    maintenance: maintenanceHome.maintenance,
    criticalWork: maintenanceHome.criticalWork,
  }));
}

function startNonCoreDomainLists(): Promise<NonCoreDomainLists> {
  const pool = WORKSPACE_HOME_POOL_SIZE;
  const emptyApr: Approval[] = [];
  const emptyFac: Array<{ id: string; name: string }> = [];

  return Promise.all([
    settleDomain(
      (signal) =>
        ApprovalService.listApprovals({ page: 1, pageSize: pool }, { signal })
          .then((page) => ({ ok: true as const, data: page.data ?? emptyApr }))
          .catch(() => ({ ok: false as const, data: emptyApr })),
      emptyApr
    ),
    settleDomain(
      (signal) =>
        FacilityService.listFacilities({ page: 1, pageSize: 200 }, { signal })
          .then((page) => ({
            ok: true as const,
            data: page.data ?? emptyFac,
          }))
          .catch(() => ({ ok: false as const, data: emptyFac })),
      emptyFac
    ),
  ]).then(([approvals, facilities]) => ({ approvals, facilities }));
}

function emptyNonCoreDomainLists(): NonCoreDomainLists {
  return {
    approvals: { ok: true, data: [] },
    facilities: { ok: true, data: [] },
  };
}

/** @internal Exported for Home degraded-domain composition verifies. */
export function composeWorkspaceSnapshot(
  asOf: string,
  currentUser: CurrentUserLite,
  lists: DomainLists
): WorkspaceSnapshot {
  const domains = {
    workOrders: lists.workOrders.ok,
    incidents: lists.incidents.ok,
    maintenance: lists.maintenance.ok,
  };
  const workOrders = lists.workOrders.ok ? lists.workOrders.data : [];
  const incidents = lists.incidents.ok ? lists.incidents.data : [];
  const maintenance = lists.maintenance.ok ? lists.maintenance.data : [];
  const approvals = lists.approvals.data;
  const coreFailed =
    !domains.workOrders || !domains.incidents || !domains.maintenance;

  const userId = currentUser?.operationalUserId ?? undefined;
  const facilityNameById = new Map(
    lists.facilities.data.map((facility) => [facility.id, facility.name])
  );
  const activity = buildActivity(workOrders, incidents, maintenance);
  const criticalWorkCount = lists.criticalWork.ok
    ? lists.criticalWork.total
    : null;
  const pulse = buildPulse(
    domains.incidents ? incidents : null,
    domains.maintenance ? maintenance : null,
    domains.workOrders ? workOrders : null,
    lists.approvals.ok ? approvals : null,
    activity,
    asOf,
    criticalWorkCount
  );
  const attentionBase = buildAttentionModel({
    asOf,
    currentUserId: userId,
    incidents,
    workOrders,
    maintenance,
    approvals,
    facilityNameById,
  });
  // Major attention sources: Work + Work Orders. Failed source ⇒ incomplete queue.
  const attentionIncomplete = !domains.maintenance || !domains.workOrders;
  const attention: AttentionModel = {
    ...attentionBase,
    incomplete: attentionIncomplete || undefined,
  };

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
    domains,
    quickActions: WORKSPACE_QUICK_ACTIONS,
    myWork: buildMyWork(userId, workOrders, incidents, maintenance),
    schedule: buildSchedule(asOf, workOrders, incidents, maintenance),
    activity,
  };
}

export type WorkspaceProgressiveLoad = {
  /** Resolves when core operational domains settle (or degrade). */
  core: Promise<WorkspaceSnapshot>;
  /** Resolves after non-core domains + currentUser enrich the snapshot. */
  complete: Promise<WorkspaceSnapshot>;
};

/**
 * Authoritative FM read composition for Command Centre and other consumers
 * that require exact organisational metrics. Critical retains the register KPI;
 * every other source is walked to its final page before shared predicates run.
 * A failed source remains null through the metric dependency rules.
 */
export async function loadOperationalPictureMetrics(
  asOf = new Date().toISOString()
) {
  const pageSize = WORKSPACE_HOME_POOL_SIZE;
  const emptyWo: WorkOrder[] = [];
  const emptyApr: Approval[] = [];

  const [maintenance, workOrders, approvals] = await Promise.all([
    settleValue<OperationalMaintenanceWalkResult>(
      (signal) =>
        loadOperationalMaintenancePages(
          (page, size, includeCriticalWorkTotal) =>
            MaintenanceService.listMaintenance(
              {
                page,
                pageSize: size,
                status: "active",
                ...(includeCriticalWorkTotal
                  ? { includeCriticalWorkTotal: true }
                  : {}),
              },
              { signal }
            ),
          pageSize
        )
          .then(({ data, criticalWork }) => ({
            ok: true as const,
            data,
            criticalWork,
          }))
          .catch(() => ({
            ok: false as const,
            data: [] as Maintenance[],
            criticalWork: null,
          })),
      { ok: false, data: [], criticalWork: null }
    ),
    settleDomain(
      (signal) =>
        loadAllPages(
          (page, size) =>
            WorkOrderService.listWorkOrders(
              { page, pageSize: size },
              { signal }
            ),
          pageSize
        )
          .then((data) => ({ ok: true as const, data }))
          .catch(() => ({ ok: false as const, data: emptyWo })),
      emptyWo
    ),
    settleDomain(
      (signal) =>
        loadAllPages(
          (page, size) =>
            ApprovalService.listApprovals(
              { page, pageSize: size },
              { signal }
            ),
          pageSize
        )
          .then((data) => ({ ok: true as const, data }))
          .catch(() => ({ ok: false as const, data: emptyApr })),
      emptyApr
    ),
  ]);

  return buildOperationalPictureMetrics({
    asOf,
    criticalWork: maintenance.ok ? maintenance.criticalWork : null,
    maintenance: maintenance.ok ? maintenance.data : null,
    workOrders: workOrders.ok ? workOrders.data : null,
    approvals: approvals.ok ? approvals.data : null,
  });
}

/** Personal FM assignments keyed by the canonical People-register user id. */
export async function loadAssignedWorkSummary(
  assigneeUserId: string
): Promise<WorkspaceWorkSummary[]> {
  const pool = WORKSPACE_HOME_POOL_SIZE;
  const [workOrders, incidents, maintenance] = await Promise.all([
    WorkOrderService.listWorkOrders({ page: 1, pageSize: pool, assignedToUserId: assigneeUserId }),
    IncidentService.listIncidents({ page: 1, pageSize: pool, assignedToUserId: assigneeUserId }),
    MaintenanceService.listMaintenance({ page: 1, pageSize: pool, assignedToUserId: assigneeUserId }),
  ]);
  return buildMyWork(
    assigneeUserId,
    workOrders.data ?? [],
    incidents.data ?? [],
    maintenance.data ?? []
  );
}

/**
 * Home composition service.
 * Aggregates only data needed for personal daily work.
 * Must not call DashboardService / ReportingService.
 */
export const WorkspaceService = {
  /**
   * Progressive Home load: start core (WO / INC / MNT) first; paint when core
   * settles; then load Approvals + Facilities and enrich. currentUser is
   * enrichment-only and never blocks first paint (may start with core).
   *
   * Approvals / Facilities must not share the initial Apps Script contention
   * window with core domain reads.
   *
   * Users catalog (full getAll walk) stays off the Home critical path.
   */
  beginWorkspaceLoad(): WorkspaceProgressiveLoad {
    const asOf = new Date().toISOString();

    const corePromise = startCoreDomainLists();
    // Defer register reads until after core settle / Home paint path.
    const nonCorePromise = corePromise.then(() => startNonCoreDomainLists());
    let latestUser: CurrentUserLite = null;
    const userPromise = UserService.getCurrentUser()
      .then((user) => {
        latestUser = user
          ? {
              id: user.id,
              name: user.name,
              operationalUserId: user.operationalUserId,
            }
          : null;
        return latestUser;
      })
      .catch(() => {
        latestUser = null;
        return null;
      });

    const core = corePromise.then((coreLists) =>
      composeWorkspaceSnapshot(asOf, latestUser, {
        ...coreLists,
        ...emptyNonCoreDomainLists(),
      })
    );

    const complete = Promise.all([
      corePromise,
      nonCorePromise,
      userPromise,
    ]).then(([coreLists, nonCoreLists, currentUser]) =>
      composeWorkspaceSnapshot(asOf, currentUser, {
        ...coreLists,
        ...nonCoreLists,
      })
    );

    return { core, complete };
  },

  /** Full snapshot (awaits core + non-core + currentUser). */
  async getWorkspace(): Promise<WorkspaceSnapshot> {
    return this.beginWorkspaceLoad().complete;
  },
};

export type IWorkspaceService = typeof WorkspaceService;
