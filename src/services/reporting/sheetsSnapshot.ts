import { apiClient } from "@/services/api/ApiClient";
import { computeReportingHealth, computeReportingKpis } from "./kpis";
import { ageInSeconds, toIsoUtc } from "./normalize";
import {
  normalizeReportingEntities,
  type ReportingSnapshotWithMeta,
} from "./normalizeEntities";
import { computeReportingProjections } from "./projections";
import type { ReportingQuery, ReportingSnapshot } from "./types";

/**
 * PERFORMANCE OPTIMIZATION LAYER — Sheets-backed reporting snapshot reader.
 * ---------------------------------------------------------------------------
 * Reads REPORTING_SNAPSHOT via Apps Script when available, then re-derives
 * KPIs / projections / health in TypeScript so there is a single authoritative
 * calculation path shared with the domain fallback builder.
 *
 * Do not import this from UI components.
 */

function isReportingSnapshot(value: unknown): value is ReportingSnapshotWithMeta {
  if (!value || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.asOf === "string" &&
    !!row.kpis &&
    typeof row.kpis === "object" &&
    !!row.health &&
    typeof row.health === "object" &&
    !!row.projections &&
    typeof row.projections === "object" &&
    Array.isArray(row.facilities) &&
    Array.isArray(row.assets) &&
    Array.isArray(row.users) &&
    Array.isArray(row.incidents) &&
    Array.isArray(row.maintenance) &&
    Array.isArray(row.workOrders)
  );
}

/**
 * Hydrate a sheet snapshot: normalize enums/timestamps, recompute derived
 * fields via the authoritative TypeScript KPI/projection engines.
 */
export function hydrateReportingSnapshot(
  raw: ReportingSnapshotWithMeta,
  source = "REPORTING_SNAPSHOT"
): ReportingSnapshotWithMeta {
  const normalized = normalizeReportingEntities(raw);
  const asOf = toIsoUtc(normalized.asOf);
  const prior = raw._snapshotMeta as
    | (NonNullable<ReportingSnapshotWithMeta["_snapshotMeta"]> & {
        version?: number | string;
      })
    | undefined;
  const generatedAt = toIsoUtc(prior?.generatedAt ?? asOf, asOf);
  const snapshotVersion =
    prior?.snapshotVersion ?? prior?.version ?? generatedAt;

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

  return {
    ...normalized,
    asOf,
    kpis,
    projections,
    health,
    _snapshotMeta: {
      source: prior?.source ?? source,
      generatedAt,
      ageInSeconds: ageInSeconds(generatedAt),
      snapshotVersion,
      scope: prior?.scope,
    },
  };
}

/**
 * Attempt to load a ReportingSnapshot from REPORTING_SNAPSHOT.
 * Returns null on miss / transport failure so callers can fall back to
 * domain service fan-out.
 */
export async function tryLoadSheetsReportingSnapshot(
  params: ReportingQuery = {}
): Promise<ReportingSnapshot | null> {
  try {
    const response = await apiClient.post<unknown>("/reporting-snapshot", {
      resource: "reporting-snapshot",
      action: "getSnapshot",
      payload: {
        facilityId: params.facilityId,
        asOf: params.asOf,
      },
    });

    if (!isReportingSnapshot(response.data)) {
      console.warn("[reporting] sheet snapshot invalid — using domain fallback");
      return null;
    }

    return hydrateReportingSnapshot(response.data);
  } catch (error) {
    console.warn(
      "[reporting] sheet snapshot unavailable — using domain fallback",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}
