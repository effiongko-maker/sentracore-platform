/**
 * Global operational notification feed — derived from live records.
 * Not a notification store / sheet. Distinct from Home “Requires attention”.
 *
 * Required sources (all must succeed for a definitive empty feed):
 *   - Requests (submitted + under_review)
 *   - Maintenance (active + critical-priority active)
 *   - Incidents (recent + critical)
 *   - Work Orders (recent + overdue)
 *
 * ZERO IS DATA. FAILURE IS NOT ZERO.
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
  invalidateSharedRequests,
  sharedRequest,
  WORKLOAD_TTL_MS,
} from "@/services/cache/sharedRequest";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";

export const REQUIRED_NOTIFICATION_SOURCES = [
  "requests",
  "maintenance",
  "incidents",
  "workOrders",
] as const;

export type RequiredNotificationSource =
  (typeof REQUIRED_NOTIFICATION_SOURCES)[number];

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

type SourceResult<T> = { ok: true; data: T[] } | { ok: false; data: T[] };

async function settleList<T>(loader: () => Promise<{ data?: T[] }>): Promise<SourceResult<T>> {
  try {
    const page = await loader();
    return { ok: true, data: page.data ?? [] };
  } catch {
    return { ok: false, data: [] };
  }
}

export type NotificationSourceLoad = {
  requests: RequestRecord[];
  maintenance: Maintenance[];
  incidents: Incident[];
  workOrders: WorkOrder[];
  failedSources: RequiredNotificationSource[];
};

export async function loadNotificationSources(): Promise<NotificationSourceLoad> {
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
    settleList(() =>
      RequestService.listRequests({
        page: 1,
        pageSize: pool,
        status: "submitted",
      })
    ),
    settleList(() =>
      RequestService.listRequests({
        page: 1,
        pageSize: pool,
        status: "under_review",
      })
    ),
    settleList(() =>
      MaintenanceService.listMaintenance({
        page: 1,
        pageSize: pool,
        status: "active",
      })
    ),
    settleList(() =>
      MaintenanceService.listMaintenance({
        page: 1,
        pageSize: pool,
        status: "active",
        priority: "critical",
      })
    ),
    settleList(() => IncidentService.listIncidents({ page: 1, pageSize: pool })),
    settleList(() =>
      IncidentService.listIncidents({
        page: 1,
        pageSize: pool,
        severity: "critical",
      })
    ),
    settleList(() => WorkOrderService.listWorkOrders({ page: 1, pageSize: pool })),
    settleList(() =>
      WorkOrderService.listWorkOrders({
        page: 1,
        pageSize: pool,
        dueDate: "overdue",
      })
    ),
  ]);

  const failedSources: RequiredNotificationSource[] = [];
  if (!requestsSubmitted.ok || !requestsUnderReview.ok) failedSources.push("requests");
  if (!maintenanceActive.ok || !maintenanceCritical.ok) {
    failedSources.push("maintenance");
  }
  if (!incidentsRecent.ok || !incidentsCritical.ok) failedSources.push("incidents");
  if (!workOrdersRecent.ok || !workOrdersOverdue.ok) failedSources.push("workOrders");

  return {
    requests: mergeById(requestsSubmitted.data, requestsUnderReview.data),
    maintenance: mergeById(maintenanceActive.data, maintenanceCritical.data),
    incidents: mergeById(incidentsRecent.data, incidentsCritical.data),
    workOrders: mergeById(workOrdersRecent.data, workOrdersOverdue.data),
    failedSources,
  };
}

export function composeNotificationFeed(
  asOf: string,
  sources: NotificationSourceLoad
): OperationalNotificationFeed {
  const derived = deriveOperationalNotifications({
    asOf,
    requests: sources.requests,
    maintenance: sources.maintenance,
    incidents: sources.incidents,
    workOrders: sources.workOrders,
  });
  return {
    ...derived,
    incomplete: sources.failedSources.length > 0 || undefined,
  };
}

async function buildFeed(asOf: string): Promise<OperationalNotificationFeed> {
  const sources = await loadNotificationSources();
  return composeNotificationFeed(asOf, sources);
}

export const OperationalNotificationService = {
  /**
   * Derived notification feed with in-flight coalescing + short TTL cache.
   * Shared by GlobalNotificationBell and Notifications inbox.
   * Incomplete feeds are not TTL-cached so a later retry can recover.
   */
  async getFeed(
    asOf = new Date().toISOString()
  ): Promise<OperationalNotificationFeed> {
    const feed = await sharedRequest(
      FEED_CACHE_KEY,
      () => buildFeed(asOf),
      { ttlMs: NOTIFICATION_FEED_TTL_MS }
    );
    if (feed.incomplete) {
      invalidateSharedRequests(FEED_CACHE_KEY);
    }
    return feed;
  },
};
