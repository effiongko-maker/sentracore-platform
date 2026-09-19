import { AssetService } from "@/services/assets/AssetService";
import { FacilityService } from "@/services/facilities/FacilityService";
import type { Incident } from "@/modules/incidents/types";
import type { WorkOrder } from "@/modules/work-orders/types";
import { IncidentService } from "@/services/incidents/IncidentService";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { EntityResolver } from "@/services/entityResolver";
import { UserService } from "@/services/users/UserService";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import { computeReportingHealth, computeReportingKpis } from "./kpis";
import { loadAllPages } from "./loadAllPages";
import { ageInSeconds, toIsoUtc } from "./normalize";
import { normalizeReportingEntities } from "./normalizeEntities";
import { computeReportingProjections } from "./projections";
import {
  hydrateReportingSnapshot,
  tryLoadSheetsReportingSnapshot,
} from "./sheetsSnapshot";
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

/**
 * Incidents (Phase 2D) and Work Instructions (Phase 2E) are Supabase-
 * authoritative. A failed or unauthorized source is reported as UNAVAILABLE —
 * never as zero rows.
 */
async function loadAuthoritative<T>(
  load: () => Promise<T[]>
): Promise<{ rows: T[]; ok: boolean }> {
  try {
    return { rows: await load(), ok: true };
  } catch {
    return { rows: [], ok: false };
  }
}

async function loadAuthoritativeIncidents(): Promise<{ rows: Incident[]; ok: boolean }> {
  return loadAuthoritative(() =>
    loadAllPages((page, pageSize) => IncidentService.listIncidents({ page, pageSize }))
  );
}

async function loadAuthoritativeWorkOrders(): Promise<{ rows: WorkOrder[]; ok: boolean }> {
  return loadAuthoritative(() =>
    loadAllPages((page, pageSize) => WorkOrderService.listWorkOrders({ page, pageSize }))
  );
}

/** Mark a snapshot whose authoritative source failed: honest summary, never "healthy". */
function withSourceHealth(
  snapshot: ReportingSnapshot,
  sources: { incidents: boolean; workOrders: boolean }
): ReportingSnapshot {
  const unavailable: Array<"incidents" | "workOrders"> = [];
  if (!sources.incidents) unavailable.push("incidents");
  if (!sources.workOrders) unavailable.push("workOrders");
  if (unavailable.length === 0) return snapshot;
  const label = unavailable.map((u) => (u === "incidents" ? "Incident" : "Work Instruction")).join(" and ");
  const meta = snapshot._snapshotMeta;
  return {
    ...snapshot,
    health: {
      ...snapshot.health,
      band: snapshot.health.band === "critical" ? "critical" : "watch",
      summary: `${label} data is unavailable; figures exclude it. ${snapshot.health.summary}`.trim(),
    },
    _snapshotMeta: meta ? { ...meta, unavailableSources: unavailable } : meta,
  };
}

/**
 * Domain fan-out fallback when REPORTING_SNAPSHOT is missing/empty/corrupt.
 * KPIs are always computed via computeReportingKpis (authoritative).
 */
async function buildReportingSnapshotFromDomain(
  params: ReportingQuery
): Promise<ReportingSnapshot> {
  const asOf = toIsoUtc(params.asOf ?? new Date().toISOString());
  const facilityId = params.facilityId;

  const [
    users,
    facilities,
    assets,
    incidentSource,
    maintenance,
    workOrderSource,
    currentUser,
  ] = await Promise.all([
    loadAllPages((page, pageSize) =>
      UserService.listUsersCatalog({ page, pageSize })
    ),
    loadAllPages((page, pageSize) =>
      FacilityService.listFacilities({ page, pageSize })
    ),
    loadAllPages((page, pageSize) =>
      AssetService.listAssetsCatalog({ page, pageSize })
    ),
    loadAuthoritativeIncidents(),
    loadAllPages((page, pageSize) =>
      MaintenanceService.listMaintenance({ page, pageSize })
    ).catch(() => []),
    loadAuthoritativeWorkOrders(),
    UserService.getCurrentUser().catch(() => null),
  ]);

  const scopedFacilities = facilityId
    ? facilities.filter((facility) => facility.id === facilityId)
    : facilities;
  const scopedAssets = filterByFacilityId(assets, facilityId);
  const scopedIncidents = filterByFacilityId(incidentSource.rows, facilityId);
  const scopedMaintenance = filterByFacilityId(maintenance, facilityId);
  const scopedWorkOrders = filterByFacilityId(workOrderSource.rows, facilityId);

  const draft: ReportingSnapshot = {
    asOf,
    facilityId,
    currentUserId: currentUser?.id,
    users,
    facilities: scopedFacilities,
    assets: scopedAssets,
    incidents: scopedIncidents,
    maintenance: scopedMaintenance,
    workOrders: scopedWorkOrders,
    kpis: {
      activeFacilities: 0,
      inactiveFacilities: 0,
      totalFacilities: 0,
      activeAssets: 0,
      totalAssets: 0,
      assetsOperationalPercent: null,
      assetsInPoorCondition: 0,
      activeWorkforce: 0,
      totalUsers: 0,
      openWorkOrders: 0,
      workOrdersCreatedToday: 0,
      workOrdersDueToday: 0,
      overdueWorkOrders: 0,
      criticalIncidents: 0,
      criticalIncidentsUnassigned: 0,
      incidentsNeedingWorkOrder: 0,
      criticalWork: 0,
      criticalWorkUnassigned: 0,
      workNeedingWorkOrder: 0,
      maintenanceBacklog: 0,
      overdueMaintenance: 0,
      maintenanceOnHold: 0,
      workOrdersOnHold: 0,
    },
    projections: {
      criticalIncidents: [],
      criticalWork: [],
      overdueWorkOrders: [],
      maintenanceAttention: [],
      blockedItems: [],
      latestOpenWorkOrders: [],
      latestActiveMaintenance: [],
    },
    health: { band: "healthy", score: 100, summary: "" },
  };

  const normalized = normalizeReportingEntities(draft);
  const kpis = computeReportingKpis({
    asOf,
    facilities: normalized.facilities,
    assets: normalized.assets,
    incidents: normalized.incidents,
    maintenance: normalized.maintenance,
    workOrders: normalized.workOrders,
    users: normalized.users,
  });
  const projections = computeReportingProjections({
    asOf,
    incidents: normalized.incidents,
    maintenance: normalized.maintenance,
    workOrders: normalized.workOrders,
  });
  const health = computeReportingHealth(kpis);
  const generatedAt = asOf;

  return withSourceHealth({
    ...normalized,
    asOf,
    kpis,
    projections,
    health,
    _snapshotMeta: {
      source: "domain_fallback",
      generatedAt,
      ageInSeconds: ageInSeconds(generatedAt),
      snapshotVersion: generatedAt,
      scope: facilityId || "__portfolio__",
    },
  }, { incidents: incidentSource.ok, workOrders: workOrderSource.ok });
}

async function buildReportingSnapshot(
  params: ReportingQuery
): Promise<ReportingSnapshot> {
  try {
    const fromSheets = await tryLoadSheetsReportingSnapshot(params);
    if (fromSheets) {
      // The Sheets REPORTING_SNAPSHOT still carries Sheet Incidents and Work
      // Orders. Replace those domains with the authoritative Supabase rows.
      const [incidents, workOrders] = await Promise.all([
        loadAuthoritativeIncidents(),
        loadAuthoritativeWorkOrders(),
      ]);
      const rehydrated = hydrateReportingSnapshot({
        ...fromSheets,
        incidents: filterByFacilityId(incidents.rows, params.facilityId),
        workOrders: filterByFacilityId(workOrders.rows, params.facilityId),
      });
      return withSourceHealth(rehydrated, {
        incidents: incidents.ok,
        workOrders: workOrders.ok,
      });
    }
  } catch (error) {
    console.warn(
      "[reporting] sheet snapshot path failed — using domain fallback",
      error instanceof Error ? error.message : error
    );
  }

  return buildReportingSnapshotFromDomain(params);
}

/**
 * Platform-wide reporting engine.
 * Public API unchanged. Prefers Sheets snapshot; falls back to domain fan-out.
 */
function withFreshAge(snapshot: ReportingSnapshot): ReportingSnapshot {
  const meta = snapshot._snapshotMeta;
  if (!meta?.generatedAt) return snapshot;
  return {
    ...snapshot,
    _snapshotMeta: {
      ...meta,
      ageInSeconds: ageInSeconds(meta.generatedAt),
    },
  };
}

export const ReportingService = {
  async getReportingSnapshot(
    params: ReportingQuery = {}
  ): Promise<ReportingSnapshot> {
    const snapshot = await SnapshotService.getOrCreate(
      snapshotCacheKey(params),
      () => buildReportingSnapshot(params)
    );
    const fresh = withFreshAge(snapshot);
    // Seed EntityResolver from snapshot rows so Dashboard/Reports avoid
    // follow-on Apps Script directory fan-out for users/facilities/assets.
    EntityResolver.primeFromReportingSnapshot(fresh);
    return fresh;
  },
};

export type IReportingService = typeof ReportingService;
