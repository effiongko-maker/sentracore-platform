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
import { normalizeAssetToken } from "@/modules/assets/utils";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import { FacilityService } from "@/services/facilities/FacilityService";
import { OperationalWorkloadService } from "@/services/operational/OperationalWorkloadService";
import { queryAssetsPage } from "./queryAssets";

/** Raw row shape from the Apps Script assets API. */
type RemoteAsset = Record<string, unknown>;

function pickField(raw: RemoteAsset, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

function mapRemoteAsset(raw: RemoteAsset): Asset {
  const id = String(pickField(raw, "id", "Asset ID") ?? "");

  const category = normalizeAssetToken(
    pickField(raw, "category", "Category") ?? "other"
  ) as AssetCategory;
  const status = normalizeAssetToken(
    pickField(raw, "status", "Status") ?? "pending"
  ) as AssetStatus;
  const condition = normalizeAssetToken(
    pickField(raw, "condition", "Condition") ?? "good"
  ) as AssetCondition;
  const criticality = normalizeAssetToken(
    pickField(raw, "criticality", "Criticality") ?? "unassessed"
  ) as AssetCriticality;

  return {
    id,
    facility: String(pickField(raw, "facility", "Facility") ?? ""),
    name: String(pickField(raw, "name", "Asset Name") ?? ""),
    category,
    manufacturer: String(pickField(raw, "manufacturer", "Manufacturer") ?? ""),
    model: String(pickField(raw, "model", "Model") ?? ""),
    serialNumber: String(
      pickField(raw, "serialNumber", "Serial Number") ?? ""
    ),
    installDate: String(
      pickField(raw, "installDate", "Install Date") ?? ""
    ),
    warrantyExpiry: String(
      pickField(raw, "warrantyExpiry", "Warranty Expiry") ?? ""
    ),
    oemId: String(pickField(raw, "oemId", "OEM ID") ?? ""),
    condition,
    status,
    assignedTo: String(
      pickField(raw, "assignedTo", "Assigned To") ?? ""
    ),
    criticality,
  };
}

function extractAssetRows(payload: unknown): Asset[] {
  if (Array.isArray(payload)) {
    return payload.map((row) => mapRemoteAsset(row as RemoteAsset));
  }
  if (payload && typeof payload === "object") {
    const page = payload as Record<string, unknown>;
    const rows = Array.isArray(page.data) ? page.data : [];
    return rows.map((row) => mapRemoteAsset(row as RemoteAsset));
  }
  return [];
}

async function loadAllAssets(): Promise<Asset[]> {
  const pageSize = 500;
  let page = 1;
  let totalPages = 1;
  const all: Asset[] = [];

  while (page <= totalPages) {
    const response = await apiClient.post<unknown>("/assets", {
      resource: "assets",
      action: "getAll",
      payload: {
        page,
        pageSize,
        search: "",
        status: "all",
        category: "all",
        facility: "all",
      },
    });

    const payload = response.data;
    const rows = extractAssetRows(payload);
    all.push(...rows);

    if (payload && typeof payload === "object" && !Array.isArray(payload)) {
      const meta = payload as Record<string, unknown>;
      totalPages = Math.max(1, Number(meta.totalPages ?? 1));
      const total = Number(meta.total ?? all.length);
      if (all.length >= total || rows.length === 0) break;
    } else {
      break;
    }

    page += 1;
    if (page > 100) break;
  }

  const byId = new Map<string, Asset>();
  for (const asset of all) {
    if (asset.id) byId.set(asset.id, asset);
  }
  return Array.from(byId.values());
}

async function loadFacilityNameById(): Promise<Map<string, string>> {
  try {
    const result = await FacilityService.listFacilities({
      page: 1,
      pageSize: 500,
    });
    return new Map(result.data.map((facility) => [facility.id, facility.name]));
  } catch {
    return new Map();
  }
}

function facilitiesEquivalent(
  expected: string,
  actual: string,
  facilityNameById: Map<string, string>
): boolean {
  const left = String(expected ?? "").trim();
  const right = String(actual ?? "").trim();
  if (!left && !right) return true;
  if (normalizeText(left) === normalizeText(right)) return true;

  const leftName = facilityNameById.get(left) ?? left;
  const rightName = facilityNameById.get(right) ?? right;
  if (normalizeText(leftName) === normalizeText(rightName)) return true;

  for (const [id, name] of facilityNameById) {
    const aliases = [id, name].map(normalizeText);
    if (
      aliases.includes(normalizeText(left)) &&
      aliases.includes(normalizeText(right))
    ) {
      return true;
    }
  }
  return false;
}

function fieldMismatch(
  field: string,
  expected: string,
  actual: string
): ApiError {
  return new ApiError(
    `Asset ${field} did not persist (expected "${expected}", got "${actual || "(empty)"}"). Redeploy Apps Script if this continues.`,
    502
  );
}

async function assertAssetPersisted(
  expectedId: string,
  intended: UpdateAssetInput,
  actual: Asset
): Promise<void> {
  if (normalizeText(actual.id) !== normalizeText(expectedId)) {
    throw fieldMismatch("id", expectedId, actual.id);
  }

  const checks: Array<[keyof UpdateAssetInput, string | undefined]> = [
    ["name", intended.name],
    ["category", intended.category],
    ["manufacturer", intended.manufacturer],
    ["model", intended.model],
    ["serialNumber", intended.serialNumber],
    ["installDate", intended.installDate],
    ["warrantyExpiry", intended.warrantyExpiry],
    ["oemId", intended.oemId],
    ["condition", intended.condition],
    ["status", intended.status],
    ["assignedTo", intended.assignedTo],
    ["criticality", intended.criticality],
  ];

  for (const [field, expected] of checks) {
    if (expected == null) continue;
    const actualValue = String(actual[field as keyof Asset] ?? "");
    if (normalizeText(expected) !== normalizeText(actualValue)) {
      throw fieldMismatch(field, String(expected), actualValue);
    }
  }

  if (intended.facility != null) {
    const facilityNameById = await loadFacilityNameById();
    if (
      !facilitiesEquivalent(
        intended.facility,
        actual.facility,
        facilityNameById
      )
    ) {
      throw fieldMismatch("facility", intended.facility, actual.facility);
    }
  }
}

/**
 * Assets domain service.
 *
 * Talks only to ApiClient — never to storage backends or UI details.
 * List uses: all → search/filters → sort → paginate.
 */
export const AssetService = {
  async listAssets(params: AssetListParams = {}): Promise<PaginatedResult<Asset>> {
    const [assets, facilityNameById, maps] = await Promise.all([
      loadAllAssets(),
      loadFacilityNameById(),
      OperationalWorkloadService.getMaps(),
    ]);
    const enriched = OperationalWorkloadService.applyToAssets(assets, maps);
    return queryAssetsPage(enriched, params, facilityNameById);
  },

  async getAsset(id: string): Promise<Asset | null> {
    try {
      const response = await apiClient.post<Asset>("/assets", {
        resource: "assets",
        action: "getById",
        payload: { id },
      });
      if (response.data == null) return null;
      return OperationalWorkloadService.enrichAsset(
        mapRemoteAsset(response.data as unknown as RemoteAsset)
      );
    } catch (error) {
      if (
        error instanceof ApiError &&
        (error.status === 404 || /not found/i.test(error.message))
      ) {
        return null;
      }
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
        "Asset create returned no record. Redeploy AssetRepository.gs if the Assets sheet headers differ.",
        502
      );
    }
    const created = mapRemoteAsset(response.data as unknown as RemoteAsset);
    if (!created.id) {
      throw new ApiError("Asset create returned a record without an id.", 502);
    }

    const verified = await AssetService.getAsset(created.id);
    if (!verified) {
      throw new ApiError(
        "Asset was created but could not be re-read from storage.",
        502
      );
    }
    await assertAssetPersisted(created.id, input, verified);
    return verified;
  },

  async updateAsset(id: string, input: UpdateAssetInput): Promise<Asset> {
    if (!id.trim()) {
      throw new ApiError("Asset id is required for update.", 400);
    }

    const response = await apiClient.post<Asset>("/assets", {
      resource: "assets",
      action: "update",
      payload: { id, ...input },
    });
    if (response.data == null) {
      throw new ApiError("Asset update returned no record.", 502);
    }

    const verified = await AssetService.getAsset(id);
    if (!verified) {
      throw new ApiError(
        `Asset ${id} update could not be confirmed — record missing after save.`,
        502
      );
    }
    await assertAssetPersisted(id, input, verified);
    return verified;
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
    const verified = await AssetService.getAsset(id);
    if (!verified) {
      throw new ApiError(
        `Asset ${id} deactivate could not be confirmed.`,
        502
      );
    }
    if (normalizeText(verified.status) !== "inactive") {
      throw fieldMismatch("status", "inactive", verified.status);
    }
    return verified;
  },
};

export type IAssetService = typeof AssetService;
