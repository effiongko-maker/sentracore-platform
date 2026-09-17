/**
 * Operational Picture metrics — derived from authoritative domain rows.
 *
 * Critical uses the exact Maintenance criticalWorkTotal KPI.
 * Consumers choose whether those rows are a bounded Home pool or a complete
 * register walk. The predicates live here so Home and Command Centre cannot
 * drift semantically.
 */

import type { Approval } from "@/modules/approvals/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  ACTIVE_MAINTENANCE_STATUSES,
  WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES,
} from "@/lib/operational/workload";
import { toIsoUtc } from "@/services/reporting/normalize";

export type OperationalPictureMetrics = {
  /** Exact high/critical open Work total (register KPI). */
  critical: number | null;
  /** Maintenance currently in_progress (WIP execution). */
  inProgress: number | null;
  /**
   * Blocked / waiting: on_hold Work & WO, Work needing WO, approvals
   * awaiting decision/response/submission.
   */
  awaitingAction: number | null;
  /** Active Work / WO past dueAt (or WO slaDueAt); excludes completed/closed. */
  overdue: number | null;
};

const OPEN_MNT = ACTIVE_MAINTENANCE_STATUSES;
const OPEN_WO = WORKSPACE_ASSIGNED_WORK_ORDER_STATUSES;

const AWAITING_APPROVAL = new Set([
  "awaiting_decision",
  "awaiting_submission",
  "submitted",
  "awaiting_response",
  "returned",
]);

function dayKey(iso: string): string {
  return toIsoUtc(iso).slice(0, 10);
}

function isBeforeDay(iso: string | undefined, asOf: string): boolean {
  if (!iso) return false;
  return dayKey(iso) < dayKey(asOf);
}

function workOrderDue(row: WorkOrder): string | undefined {
  return row.dueAt || row.slaDueAt;
}

function needsWorkOrder(row: Maintenance): boolean {
  return (
    Boolean(row.requiresWorkOrder) &&
    !row.workOrderId &&
    !(row.workOrderIds && row.workOrderIds.length > 0)
  );
}

export function buildOperationalPictureMetrics(input: {
  asOf: string;
  criticalWork: number | null;
  maintenance: Maintenance[] | null;
  workOrders: WorkOrder[] | null;
  approvals: Approval[] | null;
}): OperationalPictureMetrics {
  const { asOf, criticalWork, maintenance, workOrders, approvals } = input;

  const inProgress = maintenance
    ? maintenance.filter((row) => row.status === "in_progress").length
    : null;

  let awaitingAction: number | null = null;
  if (maintenance && workOrders && approvals) {
    let count = 0;
    if (maintenance) {
      for (const row of maintenance) {
        if (!OPEN_MNT.has(row.status)) continue;
        if (row.status === "on_hold" || needsWorkOrder(row)) count += 1;
      }
    }
    if (workOrders) {
      for (const row of workOrders) {
        if (!OPEN_WO.has(row.status)) continue;
        if (row.status === "on_hold") count += 1;
      }
    }
    if (approvals) {
      for (const row of approvals) {
        if (AWAITING_APPROVAL.has(String(row.status || ""))) count += 1;
      }
    }
    awaitingAction = count;
  }

  let overdue: number | null = null;
  if (maintenance && workOrders) {
    let count = 0;
    if (maintenance) {
      for (const row of maintenance) {
        if (!OPEN_MNT.has(row.status)) continue;
        if (isBeforeDay(row.dueAt, asOf)) count += 1;
      }
    }
    if (workOrders) {
      for (const row of workOrders) {
        if (!OPEN_WO.has(row.status)) continue;
        if (isBeforeDay(workOrderDue(row), asOf)) count += 1;
      }
    }
    overdue = count;
  }

  return {
    critical: criticalWork,
    inProgress,
    awaitingAction,
    overdue,
  };
}
