import { AssetService } from "@/services/assets/AssetService";
import { FacilityService } from "@/services/facilities/FacilityService";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { UserService } from "@/services/users/UserService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { computeReportingHealth, computeReportingKpis } from "./kpis";
import { loadAllPages } from "./loadAllPages";
import { computeReportingProjections } from "./projections";
import { SnapshotService } from "./SnapshotService";
import type { ReportingQuery, ReportingSnapshot } from "./types";

function filterByFacilityId<T extends { facilityId?: string; facility?: string }>(
  rows: T[],
  facilityId?: string
): T[] {
  if (!facilityId) return rows;
  return rows.filter((row) => {
    if ("facilityId" in row && row.facilityId) {
      return row.facilityId === facilityId;
    }
    if ("facility" in row && row.facility) {
      return row.facility === facilityId;
    }
    return false;
  });
}

function snapshotCacheKey(params: ReportingQuery): string {
  return params.facilityId?.trim() || "__portfolio__";
}

/** Existing snapshot builder — invoked only on cache miss / expiry. */
async function buildReportingSnapshot(
  params: ReportingQuery
): Promise<ReportingSnapshot> {
  const asOf = params.asOf ?? new Date().toISOString();
  const facilityId = params.facilityId;

  console.log("[hang] ReportingService domain batch START (single Promise.all)");
  const batchStarted = performance.now();

  const [
    users,
    facilities,
    assets,
    incidents,
    maintenance,
    workOrders,
    currentUser,
  ] = await Promise.all([
    loadAllPages((page, pageSize) => UserService.listUsers({ page, pageSize })),
    loadAllPages((page, pageSize) =>
      FacilityService.listFacilities({ page, pageSize })
    ),
    loadAllPages((page, pageSize) =>
      AssetService.listAssets({ page, pageSize })
    ),
    loadAllPages((page, pageSize) =>
      IncidentService.listIncidents({ page, pageSize })
    ).catch(() => []),
    loadAllPages((page, pageSize) =>
      MaintenanceService.listMaintenance({ page, pageSize })
    ).catch(() => []),
    loadAllPages((page, pageSize) =>
      WorkOrderService.listWorkOrders({ page, pageSize })
    ).catch(() => []),
    UserService.getCurrentUser().catch(() => null),
  ]);

  console.log(
    `[hang] ReportingService domain batch FINISH ${Math.round(performance.now() - batchStarted)}ms`
  );

  const scopedFacilities = facilityId
    ? facilities.filter((facility) => facility.id === facilityId)
    : facilities;
  const scopedAssets = filterByFacilityId(assets, facilityId);
  const scopedIncidents = filterByFacilityId(incidents, facilityId);
  const scopedMaintenance = filterByFacilityId(maintenance, facilityId);
  const scopedWorkOrders = filterByFacilityId(workOrders, facilityId);

  const kpis = computeReportingKpis({
    asOf,
    facilities: scopedFacilities,
    assets: scopedAssets,
    incidents: scopedIncidents,
    maintenance: scopedMaintenance,
    workOrders: scopedWorkOrders,
    users,
  });

  const projections = computeReportingProjections({
    asOf,
    incidents: scopedIncidents,
    maintenance: scopedMaintenance,
    workOrders: scopedWorkOrders,
  });

  const health = computeReportingHealth(kpis);

  return {
    asOf,
    facilityId,
    currentUserId: currentUser?.id,
    users,
    facilities: scopedFacilities,
    assets: scopedAssets,
    incidents: scopedIncidents,
    maintenance: scopedMaintenance,
    workOrders: scopedWorkOrders,
    kpis,
    projections,
    health,
  };
}

/**
 * Platform-wide reporting engine.
 * Aggregates domain services into ReportingSnapshot only.
 * Caching is internal via SnapshotService — public API unchanged.
 */
export const ReportingService = {
  async getReportingSnapshot(
    params: ReportingQuery = {}
  ): Promise<ReportingSnapshot> {
    return SnapshotService.getOrCreate(snapshotCacheKey(params), () =>
      buildReportingSnapshot(params)
    );
  },
};

export type IReportingService = typeof ReportingService;
