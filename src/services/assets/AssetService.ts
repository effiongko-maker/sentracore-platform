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
import { FacilityService } from "@/services/facilities/FacilityService";
import { queryAssetsPage } from "./queryAssets";
import {
  ASSET_FACILITY_DIAG_BUILD,
  type AssetUpdateDiag,
  type AssetUpdateResult,
} from "./assetUpdateDiag";

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

  // Explicit field keys only — never borrow adjacent columns.
  // facilityId is canonical; `facility` is a mirror for older payloads.
  const facilityId = String(
    pickField(raw, "facilityId", "facility", "Facility ID") ?? ""
  );

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
    pickField(raw, "criticality", "Criticality") ?? "unassessed"
  )
    .toLowerCase()
    .replace(/\s+/g, "_") as AssetCriticality;

  const assetTag = String(
    pickField(raw, "assetTag", "Asset Number", "Asset Tag") ?? ""
  );

  return {
    id,
    assetTag: assetTag || id,
    name: String(pickField(raw, "name", "Asset Name") ?? ""),
    category,
    facility: facilityId,
    manufacturer: String(pickField(raw, "manufacturer", "Manufacturer") ?? ""),
    model: String(pickField(raw, "model", "Model") ?? ""),
    serialNumber: String(
      pickField(raw, "serialNumber", "Serial Number") ?? ""
    ),
    purchaseDate: String(
      pickField(raw, "purchaseDate", "Install Date", "Purchase Date") ?? ""
    ),
    warrantyExpiry: String(
      pickField(raw, "warrantyExpiry", "Warranty Expiry") ?? ""
    ),
    condition,
    status,
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
        // Fetch the unfiltered set — search/filter/sort/paginate run locally
        // so the UI pipeline stays correct even if Apps Script is stale.
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

  // Deduplicate by id in case of overlapping pages.
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

/**
 * Facility values may historically be stored as id or display name.
 * Treat them as equal when they refer to the same facility.
 */
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

/**
 * Confirm the authoritative sheet row matches the values we intended to save.
 * Prevents false “Updated” toasts when the write did not stick.
 */
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
    ["purchaseDate", intended.purchaseDate],
    ["warrantyExpiry", intended.warrantyExpiry],
    ["condition", intended.condition],
    ["status", intended.status],
    ["assignedTo", intended.assignedTo],
    ["criticality", intended.criticality],
    ["description", intended.description],
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
    const [assets, facilityNameById] = await Promise.all([
      loadAllAssets(),
      loadFacilityNameById(),
    ]);
    return queryAssetsPage(assets, params, facilityNameById);
  },

  async getAsset(id: string): Promise<Asset | null> {
    try {
      const response = await apiClient.post<Asset>("/assets", {
        resource: "assets",
        action: "getById",
        payload: { id },
      });
      if (response.data == null) return null;
      return mapRemoteAsset(response.data as unknown as RemoteAsset);
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
        "Asset create returned no record. Redeploy AssetRepository.gs if the Assets sheet uses legacy headers.",
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
    const result = await AssetService.updateAssetWithDiagnostics(id, input);
    if (result.path !== "persisted") {
      throw new ApiError(
        `Asset update not confirmed (${result.path}): ${result.evidence.join(" | ")}`,
        502
      );
    }
    return result.asset;
  },

  /**
   * TEMP DIAG — full facility-update evidence path.
   * Does not toast; callers must inspect `path` / `evidence` before claiming success.
   */
  async updateAssetWithDiagnostics(
    id: string,
    input: UpdateAssetInput
  ): Promise<AssetUpdateResult> {
    if (!id.trim()) {
      throw new ApiError("Asset id is required for update.", 400);
    }

    const evidence: string[] = [];
    const execHint =
      process.env.NEXT_PUBLIC_API_URL ??
      "(browser → /api/assets → server APPS_SCRIPT_URL)";
    evidence.push(`clientExecHint=${execHint}`);

    console.info("[asset-diag][client] outbound update", {
      assetId: id,
      facility: input.facility,
      name: input.name,
      clientExecHint: execHint,
    });

    const response = await apiClient.post<RemoteAsset>("/assets", {
      resource: "assets",
      action: "update",
      payload: { id, ...input },
    });
    if (response.data == null) {
      throw new ApiError("Asset update returned no record.", 502);
    }

    const raw = response.data as RemoteAsset;
    const diag = (raw._diag as AssetUpdateDiag | undefined) ?? null;
    const returned = mapRemoteAsset(raw);

    console.info("[asset-diag][client] update response", {
      returnedFacility: returned.facility,
      diag,
    });

    if (!diag || diag.buildMarker !== ASSET_FACILITY_DIAG_BUILD) {
      evidence.push(
        `missing build marker (got ${diag?.buildMarker ?? "none"}; expected ${ASSET_FACILITY_DIAG_BUILD}) — Apps Script /exec is stale or wrong deployment`
      );
      return {
        asset: returned,
        diag,
        path: "old_deployment",
        evidence,
      };
    }

    evidence.push(
      `spreadsheet=${diag.spreadsheetName ?? "?"} (${diag.spreadsheetId ?? "?"})`
    );
    evidence.push(`sheet=${diag.sheetName ?? "?"}`);
    evidence.push(
      `facilityCols=${JSON.stringify(diag.facilityCols ?? [])}`
    );
    evidence.push(
      `before=${diag.facilityBeforeObject ?? ""} cells=${JSON.stringify(diag.facilityBeforeCells ?? [])}`
    );
    evidence.push(
      `requested=${diag.requestedFacility ?? ""} written=${diag.resolvedFacilityWritten ?? ""}`
    );
    evidence.push(`cellAfterFlush=${diag.cellAfterFlush ?? ""}`);
    evidence.push(`verifiedFacility=${diag.verifiedFacility ?? ""}`);
    evidence.push(
      `verifiedManufacturer=${(diag as { verifiedManufacturer?: string }).verifiedManufacturer ?? ""}`
    );
    evidence.push(
      `verifiedModel=${(diag as { verifiedModel?: string }).verifiedModel ?? ""}`
    );
    evidence.push(`apiReturnedFacility=${returned.facility}`);
    evidence.push(`apiReturnedManufacturer=${returned.manufacturer}`);
    evidence.push(`apiReturnedModel=${returned.model}`);

    if (!diag.facilityCols || diag.facilityCols.length === 0) {
      evidence.push("no facility column mapped on Assets sheet headers");
      return {
        asset: returned,
        diag,
        path: "no_facility_column",
        evidence,
      };
    }

    const intended = String(input.facility ?? "").trim();
    const cell = String(diag.cellAfterFlush ?? "").trim();
    const before = String(diag.facilityBeforeObject ?? "").trim();

    if (cell === before && intended && cell !== intended) {
      evidence.push(
        "sheet cell unchanged after write — persistence failed at spreadsheet layer"
      );
      return {
        asset: returned,
        diag,
        path: "sheet_unchanged",
        evidence,
      };
    }

    if (intended && cell && cell !== intended) {
      // Allow id/name equivalence only when diagnosing write target.
      const facilityNameById = await loadFacilityNameById();
      if (!facilitiesEquivalent(intended, cell, facilityNameById)) {
        evidence.push(
          `sheet cell (${cell}) does not match intended facility (${intended})`
        );
        return {
          asset: returned,
          diag,
          path: "sheet_unchanged",
          evidence,
        };
      }
    }

    // Authoritative re-read via getById
    const verified = await AssetService.getAsset(id);
    if (!verified) {
      throw new ApiError(
        `Asset ${id} update could not be confirmed — record missing after save.`,
        502
      );
    }
    evidence.push(`getById.facility=${verified.facility}`);

    if (intended) {
      const facilityNameById = await loadFacilityNameById();
      if (
        !facilitiesEquivalent(intended, verified.facility, facilityNameById)
      ) {
        evidence.push(
          "getById returned old/mismatched facility after sheet write"
        );
        return {
          asset: verified,
          diag,
          path: "sheet_changed_api_stale",
          evidence,
        };
      }
    }

    // List path re-read (same pipeline the table uses)
    const listed = await AssetService.listAssets({
      page: 1,
      pageSize: 500,
      search: id,
    });
    const listedAsset =
      listed.data.find((row) => row.id === id) ??
      (await loadAllAssets()).find((row) => row.id === id) ??
      null;
    evidence.push(
      `list.facility=${listedAsset?.facility ?? "(not in list page)"}`
    );

    if (listedAsset && intended) {
      const facilityNameById = await loadFacilityNameById();
      if (
        !facilitiesEquivalent(
          intended,
          listedAsset.facility,
          facilityNameById
        )
      ) {
        evidence.push(
          "list/query pipeline still shows old facility after confirmed sheet write"
        );
        return {
          asset: verified,
          diag,
          path: "api_ok_list_stale",
          evidence,
        };
      }
    }

    evidence.push("sheet cell + getById + list agree with intended facility");
    return {
      asset: verified,
      diag,
      path: "persisted",
      evidence,
    };
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
