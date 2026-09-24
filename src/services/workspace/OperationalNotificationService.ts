/**
 * Personal operational notification feed — derived from live records.
 * Not a notification store / sheet. Distinct from Home “Requires attention”.
 *
 * Required sources (all must succeed for a definitive empty feed):
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
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";

export const REQUIRED_NOTIFICATION_SOURCES = [
  "maintenance",
  "incidents",
  "workOrders",
] as const;

export type RequiredNotificationSource =
  (typeof REQUIRED_NOTIFICATION_SOURCES)[number];

/** Bounded newest/active pools for notification derivation (not full registers). */
export const NOTIFICATION_SOURCE_POOL_SIZE = 100;

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

/** What the caller is actually authorised to read. Unauthorized ≠ unavailable. */
export type NotificationAuthority = {
  /** requests.view — Request sources are skipped (not failed) without it. */
  canReadRequests: boolean;
  profileId: string;
  canReadOperations: boolean;
};

export type NotificationSourceReaders = {
  listRequests: (params: Parameters<typeof RequestService.listRequests>[0]) => Promise<{ data?: RequestRecord[] }>;
  listMaintenance: (params: Parameters<typeof MaintenanceService.listMaintenance>[0]) => Promise<{ data?: Maintenance[] }>;
  listIncidents: (params: Parameters<typeof IncidentService.listIncidents>[0]) => Promise<{ data?: Incident[] }>;
  listWorkOrders: (params: Parameters<typeof WorkOrderService.listWorkOrders>[0]) => Promise<{ data?: WorkOrder[] }>;
};

const DEFAULT_READERS: NotificationSourceReaders = {
  listRequests: (params) => RequestService.listRequests(params),
  listMaintenance: (params) => MaintenanceService.listMaintenance(params),
  listIncidents: (params) => IncidentService.listIncidents(params),
  listWorkOrders: (params) => WorkOrderService.listWorkOrders(params),
};

export async function loadNotificationSources(
  authority: NotificationAuthority,
  readers: NotificationSourceReaders = DEFAULT_READERS
): Promise<NotificationSourceLoad> {
  const pool = NOTIFICATION_SOURCE_POOL_SIZE;
  if (!authority.profileId || !authority.canReadOperations) {
    return { requests: [], maintenance: [], incidents: [], workOrders: [], failedSources: [] };
  }
  const assignedToUserId = authority.profileId;
  // Intake has no designated recipient. Viewing a request is not responsibility
  // for triage; do not broadcast it or infer a recipient from its creator.
  const [
    maintenanceActive,
    maintenanceCritical,
    incidentsRecent,
    incidentsCritical,
    workOrdersRecent,
    workOrdersOverdue,
  ] = await Promise.all([
    settleList(() =>
      readers.listMaintenance({ page: 1, pageSize: pool, assignedToUserId, status: "active" })
    ),
    settleList(() =>
      readers.listMaintenance({
        page: 1,
        pageSize: pool,
        assignedToUserId,
        status: "active",
        priority: "critical",
      })
    ),
    settleList(() => readers.listIncidents({ page: 1, pageSize: pool, assignedToUserId })),
    settleList(() =>
      readers.listIncidents({ page: 1, pageSize: pool, assignedToUserId, severity: "critical" })
    ),
    settleList(() => readers.listWorkOrders({ page: 1, pageSize: pool, assignedToUserId })),
    settleList(() =>
      readers.listWorkOrders({ page: 1, pageSize: pool, assignedToUserId, dueDate: "overdue" })
    ),
  ]);

  const failedSources: RequiredNotificationSource[] = [];
  if (!maintenanceActive.ok || !maintenanceCritical.ok) {
    failedSources.push("maintenance");
  }
  if (!incidentsRecent.ok || !incidentsCritical.ok) failedSources.push("incidents");
  if (!workOrdersRecent.ok || !workOrdersOverdue.ok) failedSources.push("workOrders");

  return {
    requests: [],
    maintenance: mergeById(maintenanceActive.data, maintenanceCritical.data),
    incidents: mergeById(incidentsRecent.data, incidentsCritical.data),
    workOrders: mergeById(workOrdersRecent.data, workOrdersOverdue.data),
    failedSources,
  };
}

export function composeNotificationFeed(
  asOf: string,
  sources: NotificationSourceLoad,
  profileId: string
): OperationalNotificationFeed {
  const derived = deriveOperationalNotifications({
    asOf,
    profileId,
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

async function buildFeed(
  asOf: string,
  authority: NotificationAuthority
): Promise<OperationalNotificationFeed> {
  const sources = await loadNotificationSources(authority);
  return composeNotificationFeed(asOf, sources, authority.profileId);
}

export const OperationalNotificationService = {
  async getFeed(
    authority: NotificationAuthority,
    asOf = new Date().toISOString()
  ): Promise<OperationalNotificationFeed> {
    // Always use the current session's gated reads. No cross-session feed cache.
    return buildFeed(asOf, authority);
  },
};
