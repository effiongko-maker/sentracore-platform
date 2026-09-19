/**
 * Phase 2D — Incident is Supabase-authoritative, but the Apps Script
 * `operational-workload` summary still counts Sheet Incidents. Apps Script is
 * frozen, so the Next proxy replaces ONLY the Incident component of the asset
 * summary with authoritative counts and recomputes the totals.
 *
 * Pure: safe for verify scripts.
 */

type Breakdown = { workOrders: number; maintenance: number; incidents: number };
type AssetWorkloadLike = { activeWorkload: number; workloadBreakdown: Breakdown };
type AssetEvidenceLike = AssetWorkloadLike & {
  workOrderIds: string[];
  maintenanceIds: string[];
  incidentIds: string[];
};

export type WorkloadSummaryLike = {
  byUserId?: Record<string, number>;
  byUserIdEvidence?: Record<string, unknown>;
  byAssetId?: Record<string, AssetWorkloadLike>;
  byAssetIdEvidence?: Record<string, AssetEvidenceLike>;
  [key: string]: unknown;
};

function emptyEntry(): { workload: AssetWorkloadLike; evidence: AssetEvidenceLike } {
  return {
    workload: {
      activeWorkload: 0,
      workloadBreakdown: { workOrders: 0, maintenance: 0, incidents: 0 },
    },
    evidence: {
      activeWorkload: 0,
      workloadBreakdown: { workOrders: 0, maintenance: 0, incidents: 0 },
      workOrderIds: [],
      maintenanceIds: [],
      incidentIds: [],
    },
  };
}

export function overlayIncidentWorkload(
  summary: WorkloadSummaryLike | null | undefined,
  requestedAssetIds: string[],
  incidentsByAsset: Map<string, string[]>
): WorkloadSummaryLike {
  const out: WorkloadSummaryLike = {
    ...(summary ?? {}),
    byAssetId: { ...(summary?.byAssetId ?? {}) },
    byAssetIdEvidence: { ...(summary?.byAssetIdEvidence ?? {}) },
  };
  const byAssetId = out.byAssetId!;
  const evidence = out.byAssetIdEvidence!;

  const assetIds = new Set<string>([
    ...requestedAssetIds.map((id) => id.trim()).filter(Boolean),
    ...Object.keys(byAssetId),
  ]);

  for (const assetId of assetIds) {
    const incidents = incidentsByAsset.get(assetId) ?? [];
    const current = byAssetId[assetId];
    const currentEvidence = evidence[assetId];
    if (!current && incidents.length === 0) continue;

    const base = emptyEntry();
    const workload: AssetWorkloadLike = current
      ? {
          activeWorkload: current.activeWorkload,
          workloadBreakdown: { ...current.workloadBreakdown },
        }
      : base.workload;
    const ev: AssetEvidenceLike = currentEvidence
      ? {
          ...currentEvidence,
          workloadBreakdown: { ...currentEvidence.workloadBreakdown },
          incidentIds: [...(currentEvidence.incidentIds ?? [])],
        }
      : base.evidence;

    // Remove the Sheet contribution, add the authoritative one.
    const sheetIncidents = workload.workloadBreakdown.incidents ?? 0;
    workload.activeWorkload = workload.activeWorkload - sheetIncidents + incidents.length;
    workload.workloadBreakdown.incidents = incidents.length;
    ev.activeWorkload = workload.activeWorkload;
    ev.workloadBreakdown = { ...workload.workloadBreakdown };
    ev.incidentIds = [...incidents];

    if (workload.activeWorkload > 0) {
      byAssetId[assetId] = workload;
      evidence[assetId] = ev;
    } else {
      delete byAssetId[assetId];
      delete evidence[assetId];
    }
  }
  return out;
}
