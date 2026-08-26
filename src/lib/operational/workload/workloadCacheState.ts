/**
 * Mutable workload derive cache state — separate from loaders so mutation
 * invalidation does not import WorkOrder/Incident/Maintenance services.
 */

import type { Incident } from "@/modules/incidents/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import type { OperationalWorkloadMaps } from "./deriveOperationalWorkload";

export type OperationalWorkloadSource = {
  workOrders: WorkOrder[];
  maintenance: Maintenance[];
  incidents: Incident[];
  maps: OperationalWorkloadMaps;
};

export let lastWorkloadSource: OperationalWorkloadSource | null = null;
export let workloadInflight: Promise<OperationalWorkloadSource> | null = null;
export let workloadExpiresAt = 0;

export function invalidateOperationalWorkload(): void {
  lastWorkloadSource = null;
  workloadInflight = null;
  workloadExpiresAt = 0;
}

export function setWorkloadInflight(
  promise: Promise<OperationalWorkloadSource> | null
): void {
  workloadInflight = promise;
}

export function setLastWorkloadSource(
  source: OperationalWorkloadSource | null,
  ttlMs: number
): void {
  lastWorkloadSource = source;
  workloadExpiresAt = source ? Date.now() + ttlMs : 0;
}

export function peekFreshWorkloadSource(
  now = Date.now()
): OperationalWorkloadSource | null {
  if (!lastWorkloadSource) return null;
  if (workloadExpiresAt > 0 && workloadExpiresAt <= now) {
    lastWorkloadSource = null;
    return null;
  }
  return lastWorkloadSource;
}
