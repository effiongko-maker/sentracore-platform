/**
 * Global operational notification feed — derived from live records.
 * Not a notification store / sheet. Distinct from Home “Requires attention”.
 */

import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { RequestRecord } from "@/modules/requests/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  deriveOperationalNotifications,
  type OperationalNotificationFeed,
} from "@/modules/workspace/utils/deriveOperationalNotifications";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { RequestService } from "@/services/requests/RequestService";
import {
  sharedRequest,
  WORKLOAD_TTL_MS,
} from "@/services/cache/sharedRequest";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";

const EMPTY_FEED: OperationalNotificationFeed = {
  total: 0,
  items: [],
  visible: [],
};

/** Bounded newest/active pools for notification derivation (not full registers). */
export const NOTIFICATION_SOURCE_POOL_SIZE = 100;

const FEED_CACHE_KEY = "operationalNotifications:feed";
/** Short TTL so bell + inbox share one rebuild (~30–60s). */
export const NOTIFICATION_FEED_TTL_MS = WORKLOAD_TTL_MS;

function mergeById<T extends { id: string }>(...groups: T[][]): T[] {
  const byId = new Map<string, T>();
  for (const group of groups) {
    for (const row of group) {
      if (row?.id) byId.set(row.id, row);
    }
  }
  return [...byId.values()];
}

async function loadNotificationSources(): Promise<{
  requests: RequestRecord[];
  maintenance: Maintenance[];
  incidents: Incident[];
  workOrders: WorkOrder[];
}> {
  const pool = NOTIFICATION_SOURCE_POOL_SIZE;

  const [
    requestsSubmitted,
    requestsUnderReview,
    maintenanceActive,
    maintenanceCritical,
    incidentsRecent,
    incidentsCritical,
    workOrdersRecent,
    workOrdersOverdue,
  ] = await Promise.all([
    // Open Request intake (submitted / under_review) — bounded, not loadAllPages.
    RequestService.listRequests({
      page: 1,
      pageSize: pool,
      status: "submitted",
    })
      .then((page) => page.data ?? [])
      .catch(() => [] as RequestRecord[]),
    RequestService.listRequests({
      page: 1,
      pageSize: pool,
      status: "under_review",
    })
      .then((page) => page.data ?? [])
      .catch(() => [] as RequestRecord[]),
    MaintenanceService.listMaintenance({
      page: 1,
      pageSize: pool,
      status: "active",
    })
      .then((page) => page.data ?? [])
      .catch(() => [] as Maintenance[]),
    MaintenanceService.listMaintenance({
      page: 1,
      pageSize: pool,
      status: "active",
      priority: "critical",
    })
      .then((page) => page.data ?? [])
      .catch(() => [] as Maintenance[]),
    IncidentService.listIncidents({ page: 1, pageSize: pool })
      .then((page) => page.data ?? [])
      .catch(() => [] as Incident[]),
    IncidentService.listIncidents({
      page: 1,
      pageSize: pool,
      severity: "critical",
    })
      .then((page) => page.data ?? [])
      .catch(() => [] as Incident[]),
    WorkOrderService.listWorkOrders({ page: 1, pageSize: pool })
      .then((page) => page.data ?? [])
      .catch(() => [] as WorkOrder[]),
    WorkOrderService.listWorkOrders({
      page: 1,
      pageSize: pool,
      dueDate: "overdue",
    })
      .then((page) => page.data ?? [])
      .catch(() => [] as WorkOrder[]),
  ]);

  return {
    requests: mergeById(requestsSubmitted, requestsUnderReview),
    maintenance: mergeById(maintenanceActive, maintenanceCritical),
    incidents: mergeById(incidentsRecent, incidentsCritical),
    workOrders: mergeById(workOrdersRecent, workOrdersOverdue),
  };
}

async function buildFeed(
  asOf: string
): Promise<OperationalNotificationFeed> {
  try {
    const sources = await loadNotificationSources();
    return deriveOperationalNotifications({
      asOf,
      requests: sources.requests,
      maintenance: sources.maintenance,
      incidents: sources.incidents,
      workOrders: sources.workOrders,
    });
  } catch {
    return EMPTY_FEED;
  }
}

export const OperationalNotificationService = {
  /**
   * Derived notification feed with in-flight coalescing + short TTL cache.
   * Shared by GlobalNotificationBell and Notifications inbox.
   */
  async getFeed(
    asOf = new Date().toISOString()
  ): Promise<OperationalNotificationFeed> {
    // Cache key ignores asOf so concurrent bell/inbox callers share one rebuild.
    // TTL keeps “now” freshness within ~30s.
    return sharedRequest(
      FEED_CACHE_KEY,
      () => buildFeed(asOf),
      { ttlMs: NOTIFICATION_FEED_TTL_MS }
    );
  },
};
