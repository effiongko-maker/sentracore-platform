import {
  loadOperationalWorkloadMaps,
  peekOperationalWorkloadSource,
  workloadEvidenceForAsset,
  workloadEvidenceForUser,
  workloadForAsset,
  type OperationalWorkloadMaps,
  type UserWorkloadEvidence,
  type AssetWorkloadEvidence,
} from "@/lib/operational/workload";
import {
  applyAssetWorkloadSummary,
  applyUserWorkloadSummary,
  loadBoundedWorkloadSummary,
} from "@/lib/operational/workload/loadBoundedWorkloadSummary";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import type { Asset } from "@/modules/assets/types";
import type { User } from "@/modules/users/types";
import type { WorkOrder } from "@/modules/work-orders/types";

export type UserWorkloadDetails = {
  userId: string;
  count: number;
  workOrders: WorkOrder[];
};

/**
 * Domain service for derived People / Asset workload.
 *
 * Source of truth:
 *   operational records → canonical ID relationships → derive → register fields
 *
 * Sheet USERS "Current Workload" and any asset counter cells are never trusted.
 */
export const OperationalWorkloadService = {
  async getMaps(): Promise<OperationalWorkloadMaps> {
    const maps = await loadOperationalWorkloadMaps();
    // Audit trail: prove which record IDs contribute to each count (IDs only).
    if (process.env.NODE_ENV === "development") {
      console.info("[workload.audit]", {
        people: Object.fromEntries(
          Object.entries(maps.byUserIdEvidence).map(([userId, evidence]) => [
            userId,
            { count: evidence.count, workOrderIds: evidence.workOrderIds },
          ])
        ),
        assets: Object.fromEntries(
          Object.entries(maps.byAssetIdEvidence).map(([assetId, evidence]) => [
            assetId,
            {
              activeWorkload: evidence.activeWorkload,
              breakdown: evidence.workloadBreakdown,
              workOrderIds: evidence.workOrderIds,
              maintenanceIds: evidence.maintenanceIds,
              incidentIds: evidence.incidentIds,
            },
          ])
        ),
      });
    }
    return maps;
  },

  /** Overlay People `activeWorkOrders` from active Work Orders by assignee ID. */
  applyToUsers(users: User[], maps: OperationalWorkloadMaps): User[] {
    return users.map((user) => {
      const evidence = workloadEvidenceForUser(maps.byUserIdEvidence, user.id);
      return {
        ...user,
        activeWorkOrders: evidence.count,
        workloadWorkOrderIds: evidence.workOrderIds,
      };
    });
  },

  /** Overlay Asset `activeWorkload` + breakdown from WO + MNT + INC by assetId. */
  applyToAssets(assets: Asset[], maps: OperationalWorkloadMaps): Asset[] {
    return assets.map((asset) => {
      const derived = workloadForAsset(maps.byAssetId, asset.id);
      return {
        ...asset,
        activeWorkload: derived.activeWorkload,
        workloadBreakdown: derived.workloadBreakdown,
      };
    });
  },

  async enrichUsers(users: User[]): Promise<User[]> {
    if (users.length === 0) return users;
    const summary = await loadBoundedWorkloadSummary({
      userIds: users.map((row) => row.id).filter(Boolean),
    });
    return applyUserWorkloadSummary(users, summary);
  },

  async enrichAssets(assets: Asset[]): Promise<Asset[]> {
    if (assets.length === 0) return assets;
    const summary = await loadBoundedWorkloadSummary({
      assetIds: assets.map((row) => row.id).filter(Boolean),
    });
    return applyAssetWorkloadSummary(assets, summary);
  },

  async enrichUser(user: User): Promise<User> {
    const [enriched] = await this.enrichUsers([user]);
    return enriched ?? user;
  },

  async enrichAsset(asset: Asset): Promise<Asset> {
    const [enriched] = await this.enrichAssets([asset]);
    return enriched ?? asset;
  },

  /**
   * Work Orders that produce a person's displayed workload count.
   * Same derive snapshot as `applyToUsers` whenever possible.
   */
  async listUserWorkloadDetails(
    userId: string,
    snapshotWorkOrderIds?: string[]
  ): Promise<UserWorkloadDetails> {
    let ids: string[];

    if (snapshotWorkOrderIds !== undefined) {
      ids = snapshotWorkOrderIds;
    } else {
      const peek = peekOperationalWorkloadSource();
      if (peek) {
        ids = workloadEvidenceForUser(peek.maps.byUserIdEvidence, userId)
          .workOrderIds;
      } else {
        const summary = await loadBoundedWorkloadSummary({ userIds: [userId] });
        ids =
          summary.byUserIdEvidence[userId]?.workOrderIds ??
          [];
      }
    }

    const workOrders: WorkOrder[] = [];
    const missing: string[] = [];

    const peek = peekOperationalWorkloadSource();
    const byId = peek
      ? new Map(peek.workOrders.map((row) => [row.id, row]))
      : new Map<string, WorkOrder>();

    for (const id of ids) {
      const row = byId.get(id);
      if (row) workOrders.push(row);
      else missing.push(id);
    }

    if (missing.length > 0) {
      const fetched = await Promise.all(
        missing.map((id) => WorkOrderService.getWorkOrder(id))
      );
      for (const row of fetched) {
        if (row) workOrders.push(row);
      }
    }

    return {
      userId,
      count: ids.length,
      workOrders,
    };
  },

  /** Audit helper — prove which WOs contribute to a person's workload. */
  async explainUserWorkload(userId: string): Promise<UserWorkloadEvidence> {
    const summary = await loadBoundedWorkloadSummary({ userIds: [userId] });
    const evidence = workloadEvidenceForUser(summary.byUserIdEvidence, userId);
    console.info("[workload.people.explain]", { userId, ...evidence });
    return evidence;
  },

  /** Audit helper — prove which records contribute to an asset's workload. */
  async explainAssetWorkload(assetId: string): Promise<AssetWorkloadEvidence> {
    const summary = await loadBoundedWorkloadSummary({ assetIds: [assetId] });
    const evidence = workloadEvidenceForAsset(summary.byAssetIdEvidence, assetId);
    console.info("[workload.asset.explain]", { assetId, ...evidence });
    return evidence;
  },
};
