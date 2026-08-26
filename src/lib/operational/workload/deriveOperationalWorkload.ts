import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import {
  ACTIVE_INCIDENT_STATUSES,
  ACTIVE_MAINTENANCE_STATUSES,
  ACTIVE_WORK_ORDER_STATUSES,
} from "./activeStatuses";

/** Per-entity breakdown of active operational records. */
export type WorkloadBreakdown = {
  workOrders: number;
  maintenance: number;
  incidents: number;
};

export type AssetWorkload = {
  activeWorkload: number;
  workloadBreakdown: WorkloadBreakdown;
};

/** Contributing record IDs for audit / Kaiso explanations. */
export type UserWorkloadEvidence = {
  count: number;
  workOrderIds: string[];
};

export type AssetWorkloadEvidence = {
  activeWorkload: number;
  workloadBreakdown: WorkloadBreakdown;
  workOrderIds: string[];
  maintenanceIds: string[];
  incidentIds: string[];
};

export type OperationalWorkloadMaps = {
  /**
   * People register — active Work Orders only, keyed by assignedToUserId.
   * Sheet USERS "Current Workload" is never the source of truth.
   */
  byUserId: Record<string, number>;
  byUserIdEvidence: Record<string, UserWorkloadEvidence>;
  /**
   * Assets register — active WO + Maintenance + Incidents by assetId.
   */
  byAssetId: Record<string, AssetWorkload>;
  byAssetIdEvidence: Record<string, AssetWorkloadEvidence>;
};

const EMPTY_BREAKDOWN = (): WorkloadBreakdown => ({
  workOrders: 0,
  maintenance: 0,
  incidents: 0,
});

/**
 * Only canonical IDs count — never display names.
 * People: USR-…  Assets: AST-… (also accept UUID-shaped legacy ids).
 */
export function isCanonicalUserId(value?: string | null): boolean {
  const id = String(value ?? "").trim();
  if (!id) return false;
  if (/^USR-/i.test(id)) return true;
  // Reject obvious person names (spaces / letters-only without id prefix).
  if (/\s/.test(id)) return false;
  if (/^[A-Za-z][A-Za-z.'-]+$/.test(id) && !/^\d/.test(id)) return false;
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id);
}

export function isCanonicalAssetId(value?: string | null): boolean {
  const id = String(value ?? "").trim();
  if (!id) return false;
  if (/^AST-/i.test(id)) return true;
  if (/\s/.test(id)) return false;
  return /^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id);
}

function ensureAssetWorkload(
  map: Record<string, AssetWorkload>,
  evidence: Record<string, AssetWorkloadEvidence>,
  assetId?: string | null
): { workload: AssetWorkload; evidence: AssetWorkloadEvidence } | null {
  const id = String(assetId ?? "").trim();
  if (!id || !isCanonicalAssetId(id)) return null;
  if (!map[id]) {
    map[id] = {
      activeWorkload: 0,
      workloadBreakdown: EMPTY_BREAKDOWN(),
    };
  }
  if (!evidence[id]) {
    evidence[id] = {
      activeWorkload: 0,
      workloadBreakdown: EMPTY_BREAKDOWN(),
      workOrderIds: [],
      maintenanceIds: [],
      incidentIds: [],
    };
  }
  return { workload: map[id], evidence: evidence[id] };
}

function bumpUser(
  map: Record<string, number>,
  evidence: Record<string, UserWorkloadEvidence>,
  userId: string | null | undefined,
  workOrderId: string
) {
  if (!isCanonicalUserId(userId)) return;
  const id = String(userId).trim();
  map[id] = (map[id] ?? 0) + 1;
  if (!evidence[id]) {
    evidence[id] = { count: 0, workOrderIds: [] };
  }
  evidence[id].count += 1;
  evidence[id].workOrderIds.push(workOrderId);
}

/**
 * Derive People / Asset workload from canonical operational relationships.
 *
 * People: active WO count by assignedToUserId (IDs only).
 * Assets: active WO + Maintenance + Incidents by assetId (IDs only).
 */
export function deriveOperationalWorkloadMaps(input: {
  workOrders: WorkOrder[];
  maintenance: Maintenance[];
  incidents: Incident[];
}): OperationalWorkloadMaps {
  const byUserId: Record<string, number> = {};
  const byUserIdEvidence: Record<string, UserWorkloadEvidence> = {};
  const byAssetId: Record<string, AssetWorkload> = {};
  const byAssetIdEvidence: Record<string, AssetWorkloadEvidence> = {};

  for (const row of input.workOrders) {
    if (!ACTIVE_WORK_ORDER_STATUSES.has(row.status)) continue;
    if (!row.id) continue;
    bumpUser(byUserId, byUserIdEvidence, row.assignedToUserId, row.id);
    const asset = ensureAssetWorkload(byAssetId, byAssetIdEvidence, row.assetId);
    if (asset) {
      asset.workload.workloadBreakdown.workOrders += 1;
      asset.workload.activeWorkload += 1;
      asset.evidence.workloadBreakdown.workOrders += 1;
      asset.evidence.activeWorkload += 1;
      asset.evidence.workOrderIds.push(row.id);
    }
  }

  for (const row of input.maintenance) {
    if (!ACTIVE_MAINTENANCE_STATUSES.has(row.status)) continue;
    if (!row.id) continue;
    const asset = ensureAssetWorkload(byAssetId, byAssetIdEvidence, row.assetId);
    if (asset) {
      asset.workload.workloadBreakdown.maintenance += 1;
      asset.workload.activeWorkload += 1;
      asset.evidence.workloadBreakdown.maintenance += 1;
      asset.evidence.activeWorkload += 1;
      asset.evidence.maintenanceIds.push(row.id);
    }
  }

  for (const row of input.incidents) {
    if (!ACTIVE_INCIDENT_STATUSES.has(row.status)) continue;
    if (!row.id) continue;
    const asset = ensureAssetWorkload(byAssetId, byAssetIdEvidence, row.assetId);
    if (asset) {
      asset.workload.workloadBreakdown.incidents += 1;
      asset.workload.activeWorkload += 1;
      asset.evidence.workloadBreakdown.incidents += 1;
      asset.evidence.activeWorkload += 1;
      asset.evidence.incidentIds.push(row.id);
    }
  }

  return { byUserId, byUserIdEvidence, byAssetId, byAssetIdEvidence };
}

export function workloadForUser(
  map: Record<string, number>,
  userId?: string | null
): number {
  const key = String(userId ?? "").trim();
  if (!key || !isCanonicalUserId(key)) return 0;
  return map[key] ?? 0;
}

export function workloadEvidenceForUser(
  map: Record<string, UserWorkloadEvidence>,
  userId?: string | null
): UserWorkloadEvidence {
  const key = String(userId ?? "").trim();
  if (!key || !map[key]) return { count: 0, workOrderIds: [] };
  return map[key];
}

export function workloadForAsset(
  map: Record<string, AssetWorkload>,
  assetId?: string | null
): AssetWorkload {
  const key = String(assetId ?? "").trim();
  if (!key || !map[key]) {
    return { activeWorkload: 0, workloadBreakdown: EMPTY_BREAKDOWN() };
  }
  return map[key];
}

export function workloadEvidenceForAsset(
  map: Record<string, AssetWorkloadEvidence>,
  assetId?: string | null
): AssetWorkloadEvidence {
  const key = String(assetId ?? "").trim();
  if (!key || !map[key]) {
    return {
      activeWorkload: 0,
      workloadBreakdown: EMPTY_BREAKDOWN(),
      workOrderIds: [],
      maintenanceIds: [],
      incidentIds: [],
    };
  }
  return map[key];
}

/** @deprecated Prefer workloadForUser / workloadForAsset */
export function workloadFor(
  map: Record<string, number>,
  id?: string | null
): number {
  return workloadForUser(map, id);
}
