/**
 * Bounded People / Asset workload summary composed from the authoritative
 * Supabase registers (Phase 2E). Replaces the Apps Script
 * `operational-workload` mirror, which counted Sheet Work Orders, Sheet
 * Maintenance and Sheet Incidents.
 *
 * Pure: safe for verify scripts.
 */

type Breakdown = { workOrders: number; maintenance: number; incidents: number };

export type ComposedWorkloadSummary = {
  byUserId: Record<string, number>;
  byUserIdEvidence: Record<string, { count: number; workOrderIds: string[] }>;
  byAssetId: Record<string, { activeWorkload: number; workloadBreakdown: Breakdown }>;
  byAssetIdEvidence: Record<
    string,
    {
      activeWorkload: number;
      workloadBreakdown: Breakdown;
      workOrderIds: string[];
      maintenanceIds: string[];
      incidentIds: string[];
    }
  >;
};

export function composeWorkloadSummary(input: {
  /** Active Work Instruction codes per assignee profile UUID. */
  instructionsByUser: Map<string, string[]>;
  /** Active Work Instruction / Work / Incident codes per (legacy) asset ref. */
  instructionsByAsset: Map<string, string[]>;
  workByAsset: Map<string, string[]>;
  incidentsByAsset: Map<string, string[]>;
}): ComposedWorkloadSummary {
  const out: ComposedWorkloadSummary = {
    byUserId: {},
    byUserIdEvidence: {},
    byAssetId: {},
    byAssetIdEvidence: {},
  };

  for (const [userId, codes] of input.instructionsByUser) {
    if (codes.length === 0) continue;
    out.byUserId[userId] = codes.length;
    out.byUserIdEvidence[userId] = { count: codes.length, workOrderIds: [...codes] };
  }

  const assets = new Set<string>([
    ...input.instructionsByAsset.keys(),
    ...input.workByAsset.keys(),
    ...input.incidentsByAsset.keys(),
  ]);
  for (const assetId of assets) {
    const wo = input.instructionsByAsset.get(assetId) ?? [];
    const mnt = input.workByAsset.get(assetId) ?? [];
    const inc = input.incidentsByAsset.get(assetId) ?? [];
    const total = wo.length + mnt.length + inc.length;
    if (total === 0) continue;
    const breakdown: Breakdown = { workOrders: wo.length, maintenance: mnt.length, incidents: inc.length };
    out.byAssetId[assetId] = { activeWorkload: total, workloadBreakdown: { ...breakdown } };
    out.byAssetIdEvidence[assetId] = {
      activeWorkload: total,
      workloadBreakdown: { ...breakdown },
      workOrderIds: [...wo],
      maintenanceIds: [...mnt],
      incidentIds: [...inc],
    };
  }
  return out;
}
