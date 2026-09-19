import { AssetService } from "@/services/assets/AssetService";
import { FacilityService } from "@/services/facilities/FacilityService";
import type { Asset } from "@/modules/assets/types";
import type { Facility } from "@/modules/facilities/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type { User } from "@/modules/users/types";
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
import { SnapshotService } from "./SnapshotService";
import type { ReportingQuery, ReportingSnapshot } from "./types";

function filterByFacilityId<T extends { facilityId?: string }>(
  rows: T[],
  facilityId?: string
): T[] {
  if (!facilityId) return rows;
  return rows.filter((row) => {
    // Facility identity is the UUID only — never a name or legacy code.
    return row.facilityId === facilityId;
  });
}

function snapshotCacheKey(params: ReportingQuery): string {
  return params.facilityId?.trim() || "__portfolio__";
}

/**
 * Every Reporting source is a Supabase-authoritative domain reader (People,
 * Facilities, Assets, Incidents, Work, Work Instructions). A failed or
 * unauthorized source is reported as UNAVAILABLE — never as zero rows, and never
 * replaced by Sheet data.
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

async function loadAuthoritativeUsers(): Promise<{ rows: User[]; ok: boolean }> {
  return loadAuthoritative(() => loadAllPages((page, pageSize) => UserService.listUsersCatalog({ page, pageSize })));
}

async function loadAuthoritativeFacilities(): Promise<{ rows: Facility[]; ok: boolean }> {
  return loadAuthoritative(() => loadAllPages((page, pageSize) => FacilityService.listFacilities({ page, pageSize })));
}

/** Work (fm_work) — the Sheet Maintenance register is not authoritative Work. */
async function loadAuthoritativeWork(): Promise<{ rows: Maintenance[]; ok: boolean }> {
  return loadAuthoritative(() => loadAllPages((page, pageSize) => MaintenanceService.listMaintenance({ page, pageSize })));
}

async function loadAuthoritativeAssets(): Promise<{ rows: Asset[]; ok: boolean }> {
  return loadAuthoritative(() =>
    loadAllPages((page, pageSize) => AssetService.listAssetsCatalog({ page, pageSize }))
  );
}

const SOURCE_LABELS = {
  users: "People",
  facilities: "Facility",
  maintenance: "Work",
  incidents: "Incident",
  workOrders: "Work Instruction",
  assets: "Asset",
} as const;
type ReportingSourceKey = keyof typeof SOURCE_LABELS;

/** Mark a snapshot whose authoritative source failed: honest summary, never "healthy". */
function withSourceHealth(
  snapshot: ReportingSnapshot,
  sources: Record<ReportingSourceKey, boolean>
): ReportingSnapshot {
  const unavailable = (Object.keys(SOURCE_LABELS) as ReportingSourceKey[]).filter((key) => !sources[key]);
  if (unavailable.length === 0) return snapshot;
  const label = unavailable.map((u) => SOURCE_LABELS[u]).join(", ").replace(/, ([^,]*)$/, " and $1");
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
 * Composes the reporting snapshot from the authoritative domain readers.
 * KPIs and projections are always computed via the TypeScript engines.
 */
async function buildReportingSnapshot(
  params: ReportingQuery
): Promise<ReportingSnapshot> {
  const asOf = toIsoUtc(params.asOf ?? new Date().toISOString());
  const facilityId = params.facilityId;

  const [
    userSource,
    facilitySource,
    assetSource,
    incidentSource,
    workSource,
    workOrderSource,
    currentUser,
  ] = await Promise.all([
    loadAuthoritativeUsers(),
    loadAuthoritativeFacilities(),
    loadAuthoritativeAssets(),
    loadAuthoritativeIncidents(),
    loadAuthoritativeWork(),
    loadAuthoritativeWorkOrders(),
    // Descriptive only (marks "me"); a failure leaves it unset, never fabricates data.
    UserService.getCurrentUser().catch(() => null),
  ]);

  const scopedFacilities = facilityId
    ? facilitySource.rows.filter((facility) => facility.id === facilityId)
    : facilitySource.rows;
  const scopedAssets = filterByFacilityId(assetSource.rows, facilityId);
  const scopedIncidents = filterByFacilityId(incidentSource.rows, facilityId);
  const scopedMaintenance = filterByFacilityId(workSource.rows, facilityId);
  const scopedWorkOrders = filterByFacilityId(workOrderSource.rows, facilityId);

  const draft: ReportingSnapshot = {
    asOf,
    facilityId,
    currentUserId: currentUser?.id,
    users: userSource.rows,
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
      source: "authoritative_domains",
      generatedAt,
      ageInSeconds: ageInSeconds(generatedAt),
      snapshotVersion: generatedAt,
      scope: facilityId || "__portfolio__",
    },
  }, {
    users: userSource.ok,
    facilities: facilitySource.ok,
    maintenance: workSource.ok,
    incidents: incidentSource.ok,
    workOrders: workOrderSource.ok,
    assets: assetSource.ok,
  });
}

/**
 * Platform-wide reporting engine.
 * Public API unchanged. Composed only from authoritative domain readers.
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
