import type { Asset } from "@/modules/assets/types";
import type { User } from "@/modules/users/types";
import { apiClient } from "@/services/api/ApiClient";
import { WorkOrderService } from "@/services/workOrders/WorkOrderService";
import {
  deriveOperationalWorkloadMaps,
  type OperationalWorkloadMaps,
} from "./deriveOperationalWorkload";
import { ACTIVE_WORK_ORDER_STATUSES } from "./activeStatuses";

export type EntityWorkloadSummary = Pick<
  OperationalWorkloadMaps,
  "byUserId" | "byUserIdEvidence" | "byAssetId" | "byAssetIdEvidence"
>;

function emptySummary(): EntityWorkloadSummary {
  return {
    byUserId: {},
    byUserIdEvidence: {},
    byAssetId: {},
    byAssetIdEvidence: {},
  };
}

function mapSummaryPayload(payload: unknown): EntityWorkloadSummary {
  if (!payload || typeof payload !== "object") return emptySummary();
  const row = payload as Record<string, unknown>;
  return {
    byUserId: (row.byUserId as EntityWorkloadSummary["byUserId"]) ?? {},
    byUserIdEvidence:
      (row.byUserIdEvidence as EntityWorkloadSummary["byUserIdEvidence"]) ?? {},
    byAssetId: (row.byAssetId as EntityWorkloadSummary["byAssetId"]) ?? {},
    byAssetIdEvidence:
      (row.byAssetIdEvidence as EntityWorkloadSummary["byAssetIdEvidence"]) ??
      {},
  };
}

/** Apps Script bounded summary — one round-trip when deployed. */
async function fetchEntitySummaryFromAppsScript(input: {
  assetIds?: string[];
  userIds?: string[];
}): Promise<EntityWorkloadSummary> {
  const response = await apiClient.post<unknown>("/operational-workload", {
    resource: "operational-workload",
    action: "getEntitySummary",
    payload: input,
  });
  return mapSummaryPayload(response.data);
}

/**
 * Pre-deploy fallback: active Work Orders only (People workload).
 * Assets fallback is not attempted here — deploy operational-workload GAS.
 */
async function fallbackUserSummary(userIds: string[]): Promise<EntityWorkloadSummary> {
  if (userIds.length === 0) return emptySummary();

  const page = await WorkOrderService.listWorkOrders({
    page: 1,
    pageSize: 500,
    status: "all",
  });
  const activeWorkOrders = page.data.filter((row) =>
    ACTIVE_WORK_ORDER_STATUSES.has(row.status)
  );
  const maps = deriveOperationalWorkloadMaps({
    workOrders: activeWorkOrders,
    maintenance: [],
    incidents: [],
  });

  const userSet = new Set(userIds);
  const byUserId: EntityWorkloadSummary["byUserId"] = {};
  const byUserIdEvidence: EntityWorkloadSummary["byUserIdEvidence"] = {};

  for (const userId of userSet) {
    if (maps.byUserIdEvidence[userId]) {
      byUserId[userId] = maps.byUserId[userId] ?? 0;
      byUserIdEvidence[userId] = maps.byUserIdEvidence[userId];
    }
  }

  return { byUserId, byUserIdEvidence, byAssetId: {}, byAssetIdEvidence: {} };
}

/**
 * Load workload summaries for visible People / Asset rows only.
 */
export async function loadBoundedWorkloadSummary(input: {
  assetIds?: string[];
  userIds?: string[];
}): Promise<EntityWorkloadSummary> {
  const assetIds = (input.assetIds ?? []).filter(Boolean);
  const userIds = (input.userIds ?? []).filter(Boolean);
  if (assetIds.length === 0 && userIds.length === 0) return emptySummary();

  try {
    return await fetchEntitySummaryFromAppsScript({ assetIds, userIds });
  } catch (error) {
    const message =
      error instanceof Error ? error.message.toLowerCase() : String(error);
    const unknownModule =
      message.includes("unknown module") ||
      message.includes("operational-workload");
    if (unknownModule && userIds.length > 0 && assetIds.length === 0) {
      return fallbackUserSummary(userIds);
    }
    throw error;
  }
}

export function applyAssetWorkloadSummary(
  assets: Asset[],
  summary: EntityWorkloadSummary
): Asset[] {
  return assets.map((asset) => {
    const derived = summary.byAssetId[asset.id];
    if (!derived) {
      return {
        ...asset,
        activeWorkload: 0,
        workloadBreakdown: {
          workOrders: 0,
          maintenance: 0,
          incidents: 0,
        },
      };
    }
    return {
      ...asset,
      activeWorkload: derived.activeWorkload,
      workloadBreakdown: derived.workloadBreakdown,
    };
  });
}

export function applyUserWorkloadSummary(
  users: User[],
  summary: EntityWorkloadSummary
): User[] {
  return users.map((user) => {
    const evidence = summary.byUserIdEvidence[user.id];
    if (!evidence) {
      return { ...user, activeWorkOrders: 0, workloadWorkOrderIds: [] };
    }
    return {
      ...user,
      activeWorkOrders: evidence.count,
      workloadWorkOrderIds: evidence.workOrderIds,
    };
  });
}
