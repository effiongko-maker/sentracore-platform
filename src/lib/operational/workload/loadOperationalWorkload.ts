import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { loadAllPages } from "@/services/reporting/loadAllPages";
import {
  deriveOperationalWorkloadMaps,
  type OperationalWorkloadMaps,
} from "./deriveOperationalWorkload";

/**
 * Load canonical operational records and derive workload maps.
 * Used by OperationalWorkloadService (domain layer) — not by UI as source of truth.
 * Walks paginated Work Order / Maintenance / Incident domain lists.
 */
export async function loadOperationalWorkloadMaps(): Promise<OperationalWorkloadMaps> {
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

  return deriveOperationalWorkloadMaps({
    workOrders,
    maintenance,
    incidents,
  });
}
