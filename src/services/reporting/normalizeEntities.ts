import type { Asset } from "@/modules/assets/types";
import type { Facility } from "@/modules/facilities/types";
import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { User } from "@/modules/users/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  normalizeToken,
  toIsoUtc,
  isActiveEntityStatus,
  isOperationalAssetStatus,
} from "./normalize";
import type { ReportingSnapshot, ReportingSnapshotMeta } from "./types";

export type { ReportingSnapshotMeta };

export type ReportingSnapshotWithMeta = ReportingSnapshot;

function canonicalEntityStatus(status: unknown): string {
  const token = normalizeToken(status);
  if (!token) return "pending";
  if (isOperationalAssetStatus(token) || isActiveEntityStatus(token)) {
    // Map sheet synonyms onto the canonical TS enum value.
    if (
      token === "operational" ||
      token === "in_service" ||
      token === "online" ||
      token === "available"
    ) {
      return "active";
    }
    return token === "active" ? "active" : token;
  }
  return token;
}

function normalizeFacility(row: Facility): Facility {
  return {
    ...row,
    status: canonicalEntityStatus(row.status) as Facility["status"],
    createdAt: toIsoUtc(row.createdAt),
    updatedAt: toIsoUtc(row.updatedAt, toIsoUtc(row.createdAt)),
  };
}

function normalizeAsset(row: Asset): Asset {
  return {
    ...row,
    status: canonicalEntityStatus(row.status) as Asset["status"],
    condition: normalizeToken(row.condition) as Asset["condition"],
    criticality: normalizeToken(row.criticality) as Asset["criticality"],
    category: normalizeToken(row.category) as Asset["category"],
    installDate: toIsoUtc(row.installDate),
    warrantyExpiry: toIsoUtc(row.warrantyExpiry),
  };
}

function normalizeUser(row: User): User {
  return {
    ...row,
    status: canonicalEntityStatus(row.status) as User["status"],
    createdAt: toIsoUtc(row.createdAt),
    lastActive: toIsoUtc(row.lastActive, toIsoUtc(row.createdAt)),
  };
}

function normalizeIncident(row: Incident): Incident {
  return {
    ...row,
    status: normalizeToken(row.status) as Incident["status"],
    severity: normalizeToken(row.severity) as Incident["severity"],
    type: normalizeToken(row.type) as Incident["type"],
    reportedAt: toIsoUtc(row.reportedAt),
    createdAt: toIsoUtc(row.createdAt, toIsoUtc(row.reportedAt)),
    updatedAt: toIsoUtc(row.updatedAt, toIsoUtc(row.reportedAt)),
  };
}

function normalizeMaintenance(row: Maintenance): Maintenance {
  return {
    ...row,
    status: normalizeToken(row.status) as Maintenance["status"],
    priority: normalizeToken(row.priority) as Maintenance["priority"],
    type: normalizeToken(row.type) as Maintenance["type"],
    reportedAt: toIsoUtc(row.reportedAt),
    createdAt: toIsoUtc(row.createdAt, toIsoUtc(row.reportedAt)),
    updatedAt: toIsoUtc(row.updatedAt, toIsoUtc(row.reportedAt)),
    dueAt: row.dueAt ? toIsoUtc(row.dueAt) : row.dueAt,
  };
}

function normalizeWorkOrder(row: WorkOrder): WorkOrder {
  return {
    ...row,
    status: normalizeToken(row.status) as WorkOrder["status"],
    priority: normalizeToken(row.priority) as WorkOrder["priority"],
    type: normalizeToken(row.type) as WorkOrder["type"],
    createdAt: toIsoUtc(row.createdAt),
    updatedAt: toIsoUtc(row.updatedAt, toIsoUtc(row.createdAt)),
    requestedAt: row.requestedAt
      ? toIsoUtc(row.requestedAt)
      : row.requestedAt,
    dueAt: row.dueAt ? toIsoUtc(row.dueAt) : row.dueAt,
  };
}

/** Normalize entity enums + timestamps without changing ReportingSnapshot shape. */
export function normalizeReportingEntities(
  snapshot: ReportingSnapshot
): ReportingSnapshot {
  return {
    ...snapshot,
    asOf: toIsoUtc(snapshot.asOf),
    users: snapshot.users.map(normalizeUser),
    facilities: snapshot.facilities.map(normalizeFacility),
    assets: snapshot.assets.map(normalizeAsset),
    incidents: snapshot.incidents.map(normalizeIncident),
    maintenance: snapshot.maintenance.map(normalizeMaintenance),
    workOrders: snapshot.workOrders.map(normalizeWorkOrder),
  };
}
