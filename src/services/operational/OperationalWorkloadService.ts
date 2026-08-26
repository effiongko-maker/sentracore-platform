import type { Asset } from "@/modules/assets/types";
import type { User } from "@/modules/users/types";
import {
  loadOperationalWorkloadMaps,
  workloadForAsset,
  workloadForUser,
  type OperationalWorkloadMaps,
} from "@/lib/operational/workload";

/**
 * Domain service for derived People / Asset workload.
 *
 * Source of truth:
 *   operational records → canonical relationships → derive → register fields
 *
 * Sheet USERS "Current Workload" and any asset counter cells are never trusted.
 */
export const OperationalWorkloadService = {
  async getMaps(): Promise<OperationalWorkloadMaps> {
    return loadOperationalWorkloadMaps();
  },

  /** Overlay People `activeWorkOrders` from active Work Orders by assignee. */
  applyToUsers(users: User[], maps: OperationalWorkloadMaps): User[] {
    return users.map((user) => ({
      ...user,
      activeWorkOrders: workloadForUser(maps.byUserId, user.id),
    }));
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
    const maps = await this.getMaps();
    return this.applyToUsers(users, maps);
  },

  async enrichAssets(assets: Asset[]): Promise<Asset[]> {
    if (assets.length === 0) return assets;
    const maps = await this.getMaps();
    return this.applyToAssets(assets, maps);
  },

  async enrichUser(user: User): Promise<User> {
    const [enriched] = await this.enrichUsers([user]);
    return enriched ?? user;
  },

  async enrichAsset(asset: Asset): Promise<Asset> {
    const [enriched] = await this.enrichAssets([asset]);
    return enriched ?? asset;
  },
};
