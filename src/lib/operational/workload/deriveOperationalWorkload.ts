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

export type OperationalWorkloadMaps = {
  /**
   * People register — USERS `Current Workload` / `activeWorkOrders`.
   * Active Work Orders only, keyed by assignedToUserId.
   */
  byUserId: Record<string, number>;
  /**
   * Assets register — derived Active Workload + breakdown by assetId.
   */
  byAssetId: Record<string, AssetWorkload>;
};

const EMPTY_BREAKDOWN = (): WorkloadBreakdown => ({
  workOrders: 0,
  maintenance: 0,
  incidents: 0,
});

function ensureAssetWorkload(
  map: Record<string, AssetWorkload>,
  assetId?: string | null
): AssetWorkload | null {
  const id = String(assetId ?? "").trim();
  if (!id) return null;
  if (!map[id]) {
    map[id] = {
      activeWorkload: 0,
      workloadBreakdown: EMPTY_BREAKDOWN(),
    };
  }
  return map[id];
}

function bumpUser(map: Record<string, number>, userId?: string | null) {
  const id = String(userId ?? "").trim();
  if (!id) return;
  map[id] = (map[id] ?? 0) + 1;
}

/**
 * Derive People / Asset workload from canonical operational relationships.
 *
 * People: active WO count by assignedToUserId (ignore sheet Current Workload cell).
 * Assets: active WO + Maintenance + Incidents by assetId, with breakdown.
 */
export function deriveOperationalWorkloadMaps(input: {
  workOrders: WorkOrder[];
  maintenance: Maintenance[];
  incidents: Incident[];
}): OperationalWorkloadMaps {
  const byUserId: Record<string, number> = {};
  const byAssetId: Record<string, AssetWorkload> = {};

  for (const row of input.workOrders) {
    if (!ACTIVE_WORK_ORDER_STATUSES.has(row.status)) continue;
    bumpUser(byUserId, row.assignedToUserId);
    const asset = ensureAssetWorkload(byAssetId, row.assetId);
    if (asset) {
      asset.workloadBreakdown.workOrders += 1;
      asset.activeWorkload += 1;
    }
  }

  for (const row of input.maintenance) {
    if (!ACTIVE_MAINTENANCE_STATUSES.has(row.status)) continue;
    const asset = ensureAssetWorkload(byAssetId, row.assetId);
    if (asset) {
      asset.workloadBreakdown.maintenance += 1;
      asset.activeWorkload += 1;
    }
  }

  for (const row of input.incidents) {
    if (!ACTIVE_INCIDENT_STATUSES.has(row.status)) continue;
    const asset = ensureAssetWorkload(byAssetId, row.assetId);
    if (asset) {
      asset.workloadBreakdown.incidents += 1;
      asset.activeWorkload += 1;
    }
  }

  return { byUserId, byAssetId };
}

export function workloadForUser(
  map: Record<string, number>,
  userId?: string | null
): number {
  const key = String(userId ?? "").trim();
  if (!key) return 0;
  return map[key] ?? 0;
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

/** @deprecated Prefer workloadForUser / workloadForAsset */
export function workloadFor(
  map: Record<string, number>,
  id?: string | null
): number {
  return workloadForUser(map, id);
}
