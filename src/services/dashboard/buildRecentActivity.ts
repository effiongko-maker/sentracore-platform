import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import type { DashboardCardTone, DashboardModuleRef } from "@/modules/dashboard/types";
import { toIsoUtc } from "@/services/reporting/normalize";
import type { ReportingSnapshot } from "@/services/reporting/types";

/**
 * Chronological Recent Activity row for Dashboard.
 * Not period comparison — meaningful operational events only.
 */
export type DashboardRecentActivityItem = {
  id: string;
  title: string;
  summary: string;
  at: string;
  href: string;
  tone: DashboardCardTone;
  module: DashboardModuleRef;
  entityId: string;
};

function sortByAtDesc(rows: DashboardRecentActivityItem[]) {
  return [...rows].sort((a, b) => {
    const left = toIsoUtc(a.at || "", "1970-01-01T00:00:00.000Z");
    const right = toIsoUtc(b.at || "", "1970-01-01T00:00:00.000Z");
    return right.localeCompare(left);
  });
}

function labelize(status?: string) {
  if (!status) return "";
  return status
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function modulePath(module: DashboardModuleRef): string {
  return `/${module}`;
}

/**
 * Build Recent Activity from domain records already on the reporting snapshot.
 * Prefer operational_events when that plane is wired into Dashboard; until then
 * this is chronological create/update activity — not "What Changed" / PoP language.
 */
export function buildRecentActivityFromDomain(input: {
  workOrders: WorkOrder[];
  maintenance: Maintenance[];
  incidents: Incident[];
  limit?: number;
}): DashboardRecentActivityItem[] {
  const limit = input.limit ?? 12;
  const rows: DashboardRecentActivityItem[] = [];

  for (const wo of input.workOrders) {
    const at = wo.updatedAt || wo.createdAt || wo.requestedAt;
    if (!at || !wo.id) continue;
    const createdAt = wo.createdAt ? Date.parse(wo.createdAt) : NaN;
    const updatedAt = wo.updatedAt ? Date.parse(wo.updatedAt) : NaN;
    const created =
      Number.isFinite(createdAt) &&
      (!Number.isFinite(updatedAt) || Math.abs(updatedAt - createdAt) < 60_000);
    rows.push({
      id: `ra-wo-${wo.id}-${at}`,
      title: wo.title || wo.id,
      summary: created
        ? `Work Order ${wo.id} created`
        : wo.status === "completed"
          ? `Work Order ${wo.id} completed`
          : wo.assignedToUserId
            ? `Work Order ${wo.id} · ${labelize(wo.status)}${
                wo.status === "assigned" ? " (assigned)" : ""
              }`
            : `Work Order ${wo.id} · ${labelize(wo.status)}`,
      at,
      href: modulePath("work-orders"),
      tone: wo.status === "completed" ? "success" : "info",
      module: "work-orders",
      entityId: wo.id,
    });
  }

  for (const mnt of input.maintenance) {
    const at = mnt.updatedAt || mnt.createdAt || mnt.reportedAt;
    if (!at || !mnt.id) continue;
    const linked =
      Boolean(mnt.workOrderId) ||
      (mnt.workOrderIds && mnt.workOrderIds.length > 0);
    rows.push({
      id: `ra-mnt-${mnt.id}-${at}`,
      title: mnt.title || mnt.id,
      summary: linked
        ? `Work ${mnt.id} linked to work order`
        : `Work ${mnt.id} · ${labelize(mnt.status)}`,
      at,
      href: modulePath("work"),
      tone: "warning",
      module: "work",
      entityId: mnt.id,
    });
  }

  for (const inc of input.incidents) {
    const at = inc.updatedAt || inc.createdAt || inc.reportedAt;
    if (!at || !inc.id) continue;
    const resolved = inc.status === "resolved" || inc.status === "closed";
    rows.push({
      id: `ra-inc-${inc.id}-${at}`,
      title: inc.title || inc.id,
      summary: resolved
        ? `Legacy incident ${inc.id} resolved`
        : `Legacy incident ${inc.id} reported · ${labelize(inc.severity)}`,
      at,
      href: modulePath("incidents"),
      tone: resolved ? "success" : "danger",
      module: "incidents",
      entityId: inc.id,
    });
  }

  return sortByAtDesc(rows).slice(0, limit);
}

export function buildRecentActivityFromReportingSnapshot(
  report: ReportingSnapshot
): DashboardRecentActivityItem[] {
  return buildRecentActivityFromDomain({
    workOrders: report.workOrders ?? [],
    maintenance: report.maintenance ?? [],
    incidents: report.incidents ?? [],
    limit: 12,
  });
}
