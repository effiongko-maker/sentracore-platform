import type { PaginatedResult } from "@/types";
import type {
  Asset,
  AssetCategory,
  AssetCondition,
  AssetCriticality,
  AssetListParams,
  AssetStatus,
  CreateAssetInput,
  UpdateAssetInput,
} from "@/modules/assets/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";

/** Raw row shape from the Apps Script assets API. */
type RemoteAsset = Record<string, unknown>;

function pickField(raw: RemoteAsset, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function mapRemoteAsset(raw: RemoteAsset): Asset {
  const id = String(pickField(raw, "id", "Asset ID") ?? "");
  const category = String(pickField(raw, "category", "Category") ?? "other")
    .toLowerCase()
    .replace(/\s+/g, "_") as AssetCategory;
  const status = String(pickField(raw, "status", "Status") ?? "pending")
    .toLowerCase()
    .replace(/\s+/g, "_") as AssetStatus;
  const condition = String(pickField(raw, "condition", "Condition") ?? "good")
    .toLowerCase()
    .replace(/\s+/g, "_") as AssetCondition;
  const criticality = String(
    pickField(raw, "criticality", "Criticality") ?? "medium"
  )
    .toLowerCase()
    .replace(/\s+/g, "_") as AssetCriticality;

  return {
    id,
    // No Asset Tag column in live sheet — temporarily use Asset ID.
    assetTag: String(pickField(raw, "assetTag", "Asset Tag", "Asset ID") ?? id),
    name: String(pickField(raw, "name", "Asset Name") ?? ""),
    category,
    facility: String(pickField(raw, "facility", "Facility ID") ?? ""),
    manufacturer: String(pickField(raw, "manufacturer", "Manufacturer") ?? ""),
    model: String(pickField(raw, "model", "Model") ?? ""),
    serialNumber: String(
      pickField(raw, "serialNumber", "Serial Number") ?? ""
    ),
    purchaseDate: String(
      pickField(raw, "purchaseDate", "Install Date") ?? ""
    ),
    warrantyExpiry: String(
      pickField(raw, "warrantyExpiry", "Warranty Expiry") ?? ""
    ),
    condition,
    status,
    // No Assigned To column — temporarily use OEM ID.
    assignedTo: String(
      pickField(raw, "assignedTo", "Assigned To", "OEM ID") ?? ""
    ),
    criticality,
    description: (() => {
      const value = pickField(raw, "description", "Description");
      return value != null ? String(value) : undefined;
    })(),
    createdAt: String(
      pickField(raw, "createdAt", "Created At") ?? new Date().toISOString()
    ),
    updatedAt: String(
      pickField(raw, "updatedAt", "Updated At") ?? new Date().toISOString()
    ),
  };
}

function toPaginatedAssets(
  payload: unknown,
  params: AssetListParams
): PaginatedResult<Asset> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) => mapRemoteAsset(row as RemoteAsset));
    return {
      data,
      page: params.page ?? 1,
      pageSize: params.pageSize ?? data.length,
      total: data.length,
      totalPages: 1,
    };
  }

  if (payload && typeof payload === "object") {
    const page = payload as Record<string, unknown>;
    const rows = Array.isArray(page.data) ? page.data : [];
    return {
      data: rows.map((row) => mapRemoteAsset(row as RemoteAsset)),
      page: Number(page.page ?? params.page ?? 1),
      pageSize: Number(page.pageSize ?? params.pageSize ?? rows.length),
      total: Number(page.total ?? rows.length),
      totalPages: Number(page.totalPages ?? 1),
    };
  }

  return {
    data: [],
    page: 1,
    pageSize: params.pageSize ?? 8,
    total: 0,
    totalPages: 1,
  };
}

/**
 * Assets domain service.
 *
 * Talks only to ApiClient — never to storage backends or UI details.
 * Mirrors FacilityService exactly.
 */
export const AssetService = {
  async listAssets(params: AssetListParams = {}): Promise<PaginatedResult<Asset>> {
    const response = await apiClient.post<unknown>("/assets", {
      resource: "assets",
      action: "getAll",
      payload: params,
    });

    return toPaginatedAssets(response.data, params);
  },

  async getAsset(id: string): Promise<Asset | null> {
    try {
      const response = await apiClient.get<Asset>(`/assets/${id}`);
      return response.data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createAsset(input: CreateAssetInput): Promise<Asset> {
    const response = await apiClient.post<Asset>("/assets", {
      resource: "assets",
      action: "create",
      payload: input,
    });
    if (response.data == null) {
      throw new ApiError(
        "Asset create returned no record. Redeploy AssetRepository.gs if the Assets sheet uses legacy headers.",
        502
      );
    }
    return mapRemoteAsset(response.data as unknown as RemoteAsset);
  },

  async updateAsset(id: string, input: UpdateAssetInput): Promise<Asset> {
    const response = await apiClient.post<Asset>("/assets", {
      resource: "assets",
      action: "update",
      payload: { id, ...input },
    });
    if (response.data == null) {
      throw new ApiError("Asset update returned no record.", 502);
    }
    return mapRemoteAsset(response.data as unknown as RemoteAsset);
  },

  /** Soft-deactivate only — assets are never deleted. */
  async deactivateAsset(id: string): Promise<Asset> {
    const response = await apiClient.post<Asset>("/assets", {
      resource: "assets",
      action: "deactivate",
      payload: { id },
    });
    if (response.data == null) {
      throw new ApiError("Asset deactivate returned no record.", 502);
    }
    return mapRemoteAsset(response.data as unknown as RemoteAsset);
  },
};

export type IAssetService = typeof AssetService;
