import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { WORKLOAD_TTL_MS } from "@/services/cache/sharedRequest";
import { loadAllPages } from "@/services/reporting/loadAllPages";
import {
  deriveOperationalWorkloadMaps,
  type OperationalWorkloadMaps,
} from "./deriveOperationalWorkload";
import {
  invalidateOperationalWorkload,
  peekFreshWorkloadSource,
  setLastWorkloadSource,
  setWorkloadInflight,
  workloadInflight,
  type OperationalWorkloadSource,
} from "./workloadCacheState";

export type { OperationalWorkloadSource };
export { invalidateOperationalWorkload };

/**
 * Load canonical operational records and derive workload maps.
 * Concurrent callers share one inflight Promise. Successful results reuse a
 * short TTL so sequential enrich paths do not re-hit Apps Script immediately.
 */
export async function loadOperationalWorkloadSource(): Promise<OperationalWorkloadSource> {
  const fresh = peekFreshWorkloadSource();
  if (fresh) return fresh;
  if (workloadInflight) return workloadInflight;

  const run = (async () => {
    const [workOrders, maintenance, incidents] = await Promise.all([
      loadAllPages((page, pageSize) =>
        WorkOrderService.listWorkOrders({ page, pageSize })
      ),
      loadAllPages((page, pageSize) =>
        MaintenanceService.listMaintenance({ page, pageSize })
      ),
      loadAllPages((page, pageSize) =>
        IncidentService.listIncidents({ page, pageSize })
      ),
    ]);

    const maps = deriveOperationalWorkloadMaps({
      workOrders,
      maintenance,
      incidents,
    });

    const source: OperationalWorkloadSource = {
      workOrders,
      maintenance,
      incidents,
      maps,
    };
    setLastWorkloadSource(source, WORKLOAD_TTL_MS);
    return source;
  })().finally(() => {
    setWorkloadInflight(null);
  });

  setWorkloadInflight(run);
  return run;
}

export async function loadOperationalWorkloadMaps(): Promise<OperationalWorkloadMaps> {
  const source = await loadOperationalWorkloadSource();
  return source.maps;
}

/** Last derive snapshot — same records as the most recent People/Asset enrich. */
export function peekOperationalWorkloadSource(): OperationalWorkloadSource | null {
  return peekFreshWorkloadSource();
}
