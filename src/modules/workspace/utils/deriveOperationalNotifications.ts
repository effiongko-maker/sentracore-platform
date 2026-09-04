/**
 * Operational notification / attention feed for Facility Management Home.
 *
 * Derives high-signal items from existing operational records.
 * Presentation must not reimplement these rules.
 *
 * NCC origin (available today):
 *   Submit Request (`/occupant-requests`) → RequestService.createRequest → RequestRecord.
 *   Request Queue create is retired; open Request intake rows ARE the NCC/Submit Request path.
 *   Issue composition maps these to source "staff_request". No separate NCC column required.
 *
 * Unsupported (no reliable persisted signal yet):
 * - Formal escalations (no escalation event/status on Issue/Incident/Work)
 */

import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { RequestRecord } from "@/modules/requests/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  ACTIVE_INCIDENT_STATUSES,
  ACTIVE_MAINTENANCE_STATUSES,
  WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES,
} from "@/lib/operational/workload";

export const OPERATIONAL_NOTIFICATION_LIMIT = 5;

/** Recency window for “new” / “raised” informational items. */
export const OPERATIONAL_NOTIFICATION_RECENT_MS = 7 * 24 * 60 * 60 * 1000;

export type OperationalNotificationKind =
  | "ncc_raised_issue"
  | "new_issue"
  | "elevated_issue"
  | "work_order_raised"
  | "deadline_passed";

export type OperationalNotification = {
  id: string;
  kind: OperationalNotificationKind;
  /** Short event type label shown first (e.g. "Work order raised"). */
  eventType: string;
  /** Concise description of what happened. */
  title: string;
  /** When the event / urgency was established (ISO). */
  at: string;
  actionLabel: string;
  href: string;
  /** Lower = higher importance. */
  priority: number;
};

export type OperationalNotificationFeed = {
  total: number;
  visible: OperationalNotification[];
  viewAllHref?: string;
  viewAllLabel?: string;
};

export type DeriveOperationalNotificationsInput = {
  asOf: string;
  requests?: RequestRecord[];
  maintenance: Maintenance[];
  incidents: Incident[];
  workOrders: WorkOrder[];
};

const OPEN_WO = WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES;
const OPEN_MNT = ACTIVE_MAINTENANCE_STATUSES;
const OPEN_INC = ACTIVE_INCIDENT_STATUSES;

const KIND_PRIORITY: Record<OperationalNotificationKind, number> = {
  ncc_raised_issue: 0,
  new_issue: 1,
  // Formal escalations would sit here if a durable escalation signal existed.
  elevated_issue: 2,
  work_order_raised: 3,
  deadline_passed: 4,
};

function dayKey(iso: string): string {
  return iso.slice(0, 10);
}

function isBeforeDay(iso: string | undefined, asOf: string): boolean {
  if (!iso) return false;
  return dayKey(iso) < dayKey(asOf);
}

function withinRecent(iso: string | undefined, asOfMs: number): boolean {
  if (!iso) return false;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return false;
  return asOfMs - at <= OPERATIONAL_NOTIFICATION_RECENT_MS && asOfMs - at >= 0;
}

function workOrderDue(row: WorkOrder): string | undefined {
  return row.dueAt || row.slaDueAt;
}

/**
 * Open Request intake rows from Submit Request (NCC path).
 * Durable signal: RequestRecord itself (loaded via RequestService).
 */
function fromNccRaisedRequests(
  requests: RequestRecord[],
  asOfMs: number
): OperationalNotification[] {
  const items: OperationalNotification[] = [];
  for (const row of requests) {
    if (row.status !== "submitted" && row.status !== "under_review") continue;
    const at = row.createdAt || row.occurredAt || new Date(asOfMs).toISOString();
    items.push({
      id: `req-ncc-${row.id}`,
      kind: "ncc_raised_issue",
      eventType: "NCC raised issue",
      title: row.title?.trim() || row.id,
      at,
      actionLabel: "View issue →",
      href: `/issues?id=${encodeURIComponent(row.id)}`,
      priority: KIND_PRIORITY.ncc_raised_issue,
    });
  }
  return items;
}

function fromRecentStandaloneWork(
  maintenance: Maintenance[],
  asOfMs: number
): OperationalNotification[] {
  const items: OperationalNotification[] = [];
  for (const row of maintenance) {
    if (row.sourceRequestId?.trim()) continue;
    if (!OPEN_MNT.has(row.status)) continue;
    if (!withinRecent(row.createdAt, asOfMs)) continue;
    items.push({
      id: `mnt-new-${row.id}`,
      kind: "new_issue",
      eventType: "New issue",
      title: row.title?.trim() || row.id,
      at: row.createdAt,
      actionLabel: "Review →",
      href: "/work",
      priority: KIND_PRIORITY.new_issue,
    });
  }
  return items;
}

function fromElevatedOpenWork(
  maintenance: Maintenance[],
  incidents: Incident[]
): OperationalNotification[] {
  const items: OperationalNotification[] = [];

  for (const row of maintenance) {
    if (!OPEN_MNT.has(row.status)) continue;
    if (row.priority !== "critical") continue;
    items.push({
      id: `mnt-elevated-${row.id}`,
      kind: "elevated_issue",
      eventType: "Elevated issue",
      title: row.title?.trim() || row.id,
      at: row.updatedAt || row.createdAt,
      actionLabel: "Review →",
      href: "/work",
      priority: KIND_PRIORITY.elevated_issue,
    });
  }

  for (const row of incidents) {
    if (!OPEN_INC.has(row.status)) continue;
    if (!(row.isEmergency || row.severity === "critical")) continue;
    items.push({
      id: `inc-elevated-${row.id}`,
      kind: "elevated_issue",
      eventType: row.isEmergency ? "Emergency issue" : "Elevated issue",
      title: row.title?.trim() || row.id,
      at: row.reportedAt || row.createdAt,
      actionLabel: "Review →",
      href: "/incidents",
      priority: KIND_PRIORITY.elevated_issue,
    });
  }

  return items;
}

function fromWorkOrdersRaised(
  workOrders: WorkOrder[],
  asOfMs: number
): OperationalNotification[] {
  const items: OperationalNotification[] = [];
  for (const row of workOrders) {
    if (!OPEN_WO.has(row.status) && row.status !== "draft") continue;
    if (!withinRecent(row.createdAt, asOfMs)) continue;
    items.push({
      id: `wo-raised-${row.id}`,
      kind: "work_order_raised",
      eventType: "Work order raised",
      title: `${row.id} — ${row.title?.trim() || "Work order"}`,
      at: row.createdAt,
      actionLabel: "Open →",
      href: `/work-orders?id=${encodeURIComponent(row.id)}`,
      priority: KIND_PRIORITY.work_order_raised,
    });
  }
  return items;
}

function fromDeadlinesPassed(
  workOrders: WorkOrder[],
  maintenance: Maintenance[],
  asOf: string
): OperationalNotification[] {
  const items: OperationalNotification[] = [];

  for (const row of workOrders) {
    if (!OPEN_WO.has(row.status)) continue;
    const due = workOrderDue(row);
    if (!isBeforeDay(due, asOf)) continue;
    items.push({
      id: `wo-deadline-${row.id}`,
      kind: "deadline_passed",
      eventType: "Deadline passed",
      title: `${row.id} was due ${due ? dayKey(due) : "earlier"}`,
      at: due || row.updatedAt || row.createdAt,
      actionLabel: "Review →",
      href: `/work-orders?id=${encodeURIComponent(row.id)}`,
      priority: KIND_PRIORITY.deadline_passed,
    });
  }

  for (const row of maintenance) {
    if (!OPEN_MNT.has(row.status)) continue;
    if (!isBeforeDay(row.dueAt, asOf)) continue;
    items.push({
      id: `mnt-deadline-${row.id}`,
      kind: "deadline_passed",
      eventType: "Deadline passed",
      title: `${row.title?.trim() || row.id} was due ${
        row.dueAt ? dayKey(row.dueAt) : "earlier"
      }`,
      at: row.dueAt || row.updatedAt || row.createdAt,
      actionLabel: "Review →",
      href: "/work",
      priority: KIND_PRIORITY.deadline_passed,
    });
  }

  return items;
}

function entityKey(item: OperationalNotification): string {
  const match = item.id.match(/^(req|mnt|inc|wo)-[a-z]+-(.+)$/);
  if (!match) return item.id;
  return `${match[1]}:${match[2]}`;
}

function dedupeByEntity(
  items: OperationalNotification[]
): OperationalNotification[] {
  const byEntity = new Map<string, OperationalNotification>();
  for (const item of items) {
    const key = entityKey(item);
    const existing = byEntity.get(key);
    if (!existing || item.priority < existing.priority) {
      byEntity.set(key, item);
    }
  }
  return [...byEntity.values()];
}

function sortNotifications(
  items: OperationalNotification[]
): OperationalNotification[] {
  return [...items].sort((a, b) => {
    if (a.priority !== b.priority) return a.priority - b.priority;
    return (b.at || "").localeCompare(a.at || "");
  });
}

/**
 * Derive a compact, importance-ordered notification feed from live operational data.
 */
export function deriveOperationalNotifications(
  input: DeriveOperationalNotificationsInput
): OperationalNotificationFeed {
  const asOfMs = Date.parse(input.asOf) || Date.now();
  const requests = input.requests ?? [];

  const combined = [
    ...fromNccRaisedRequests(requests, asOfMs),
    ...fromRecentStandaloneWork(input.maintenance, asOfMs),
    ...fromElevatedOpenWork(input.maintenance, input.incidents),
    ...fromWorkOrdersRaised(input.workOrders, asOfMs),
    ...fromDeadlinesPassed(input.workOrders, input.maintenance, input.asOf),
  ];

  const sorted = sortNotifications(dedupeByEntity(combined));
  const total = sorted.length;
  const visible = sorted.slice(0, OPERATIONAL_NOTIFICATION_LIMIT);

  return {
    total,
    visible,
    viewAllHref: total > OPERATIONAL_NOTIFICATION_LIMIT ? "/issues" : undefined,
    viewAllLabel:
      total > OPERATIONAL_NOTIFICATION_LIMIT ? "View all →" : undefined,
  };
}
