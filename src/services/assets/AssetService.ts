import type { PaginatedResult } from "@/types";
import type {
  Asset,
  AssetListParams,
  CreateAssetInput,
  UpdateAssetInput,
} from "@/modules/assets/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onAssetMutation,
} from "@/services/cache/domainCache";
import {
  CATALOG_TTL_MS,
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";
import {
  applyAssetWorkloadSummary,
  loadBoundedWorkloadSummary,
} from "@/lib/operational/workload/loadBoundedWorkloadSummary";

/** The server returns the Asset contract directly (Supabase `fm_assets`). */
type RemoteAsset = Asset;

function mapAsset(raw: RemoteAsset): Asset {
  return {
    ...raw,
    id: String(raw.id ?? ""),
    code: String(raw.code ?? ""),
    facilityId: String(raw.facilityId ?? ""),
    facility: String(raw.facility ?? ""),
    assignedToUserId: String(raw.assignedToUserId ?? ""),
    assignedTo: String(raw.assignedTo ?? ""),
  };
}

function toPaginatedAssets(payload: unknown): PaginatedResult<Asset> {
  if (!payload || typeof payload !== "object" || !Array.isArray((payload as { data?: unknown }).data)) {
    // A malformed response is a failure, never a healthy empty page.
    throw new ApiError("Asset source returned an invalid response.", 502);
  }
  const page = payload as { data: RemoteAsset[]; page?: number; pageSize?: number; total?: number; totalPages?: number };
  return {
    data: page.data.map(mapAsset),
    page: Number(page.page ?? 1),
    pageSize: Number(page.pageSize ?? page.data.length),
    total: Number(page.total ?? page.data.length),
    totalPages: Number(page.totalPages ?? 1),
  };
}

function listPayload(params: AssetListParams) {
  return {
    page: params.page ?? 1,
    pageSize: params.pageSize ?? 8,
    search: params.search ?? "",
    status: params.status ?? "all",
    category: params.category ?? "all",
    facilityId: params.facilityId ?? "all",
    criticality: params.criticality ?? "all",
    sort: params.sort ?? "newest",
  };
}

async function fetchAssetsPage(params: AssetListParams): Promise<PaginatedResult<Asset>> {
  const response = await apiClient.post<unknown>("/assets", {
    resource: "assets",
    action: "getAll",
    payload: listPayload(params),
  });
  return toPaginatedAssets(response.data);
}

async function fetchAllAssetsUncached(): Promise<Asset[]> {
  const pageSize = 500;
  const all: Asset[] = [];
  for (let page = 1; page <= 100; page += 1) {
    const result = await fetchAssetsPage({ page, pageSize });
    all.push(...result.data);
    if (all.length >= result.total || result.data.length === 0) break;
  }
  const byId = new Map<string, Asset>();
  for (const asset of all) byId.set(asset.id, asset);
  return Array.from(byId.values());
}

/** Coalesced + short-TTL asset catalog rows (no workload enrichment). */
async function loadAllAssets(): Promise<Asset[]> {
  return sharedRequest(`${CacheNamespaces.assetsCatalog}:all`, fetchAllAssetsUncached, { ttlMs: CATALOG_TTL_MS });
}

/**
 * Assets domain service (browser client → /api/assets → Supabase).
 * Workload overlay is applied separately via enrichAssetsWorkload().
 */
export const AssetService = {
  async listAssets(params: AssetListParams = {}): Promise<PaginatedResult<Asset>> {
    const key = stableRequestKey(CacheNamespaces.assetsList, listPayload(params));
    return sharedRequest(key, () => fetchAssetsPage(params));
  },

  /** Bounded workload overlay for visible asset rows (lazy — not on list critical path). */
  async enrichAssetsWorkload(assets: Asset[]): Promise<Asset[]> {
    if (assets.length === 0) return assets;
    const summary = await loadBoundedWorkloadSummary({ assetIds: assets.map((row) => row.id) });
    return applyAssetWorkloadSummary(assets, summary);
  },

  /** Lightweight reference catalog — selects and EntityResolver only (server-filtered). */
  async listAssetsCatalog(params: AssetListParams = {}): Promise<PaginatedResult<Asset>> {
    return AssetService.listAssets(params);
  },

  /** Full unfiltered asset list without workload enrichment. */
  async fetchAssetsCatalog(): Promise<Asset[]> {
    return loadAllAssets();
  },

  async getAsset(id: string): Promise<Asset | null> {
    try {
      const response = await apiClient.post<RemoteAsset>("/assets", { resource: "assets", action: "getById", payload: { id } });
      if (response.data == null) return null;
      const asset = mapAsset(response.data);
      const [enriched] = await AssetService.enrichAssetsWorkload([asset]);
      return enriched ?? asset;
    } catch (error) {
      if (error instanceof ApiError && (error.status === 404 || /not found/i.test(error.message))) return null;
      throw error;
    }
  },

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    const response = await apiClient.post<RemoteAsset>("/assets", { resource: "assets", action: "create", payload: input });
    if (response.data == null) throw new ApiError("Asset create returned no record.", 502);
    const created = mapAsset(response.data);
    if (!created.id) throw new ApiError("Asset create returned a record without an id.", 502);
    onAssetMutation();
    return created;
  },

  async updateAsset(id: string, input: UpdateAssetInput): Promise<Asset> {
    if (!id.trim()) throw new ApiError("Asset id is required for update.", 400);
    const response = await apiClient.post<RemoteAsset>("/assets", { resource: "assets", action: "update", payload: { id, ...input } });
    if (response.data == null) throw new ApiError("Asset update returned no record.", 502);
    onAssetMutation();
    return mapAsset(response.data);
  },

  /** Soft-deactivate only — assets are never deleted. */
  async deactivateAsset(id: string): Promise<Asset> {
    const response = await apiClient.post<RemoteAsset>("/assets", { resource: "assets", action: "deactivate", payload: { id } });
    if (response.data == null) throw new ApiError("Asset deactivate returned no record.", 502);
    onAssetMutation();
    return mapAsset(response.data);
  },
};

export type IAssetService = typeof AssetService;
