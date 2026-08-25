import type { PaginatedResult } from "@/types";
import type { Asset, AssetListParams } from "@/modules/assets/types";

function normalize(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

/** Newest created first; id descending as stable tie-breaker. */
export function sortAssetsNewestFirst(assets: Asset[]): Asset[] {
  return [...assets].sort((a, b) => {
    const aAt = a.createdAt || a.updatedAt || "";
    const bAt = b.createdAt || b.updatedAt || "";
    if (aAt === bAt) {
      return b.id.localeCompare(a.id);
    }
    return aAt < bAt ? 1 : -1;
  });
}

/**
 * Facility values on assets may be an id or a display name.
 * Match the active filter against either form.
 */
export function assetMatchesFacility(
  assetFacility: string,
  facilityFilter: string | "all" | undefined,
  facilityNameById: Map<string, string>
): boolean {
  if (!facilityFilter || facilityFilter === "all") return true;
  const stored = String(assetFacility ?? "").trim();
  if (!stored) return false;
  if (stored === facilityFilter) return true;

  const filterName = facilityNameById.get(facilityFilter);
  if (filterName && stored === filterName) return true;

  for (const [id, name] of facilityNameById) {
    if (name === facilityFilter && (stored === id || stored === name)) {
      return true;
    }
  }
  return false;
}

export function assetMatchesSearch(
  asset: Asset,
  search: string | undefined,
  facilityNameById: Map<string, string>
): boolean {
  const q = normalize(search);
  if (!q) return true;

  const facilityLabel =
    facilityNameById.get(asset.facility) ?? asset.facility;

  const haystack = [
    asset.name,
    asset.assetTag,
    asset.id,
    asset.facility,
    facilityLabel,
    asset.serialNumber,
    asset.manufacturer,
    asset.model,
  ]
    .map(normalize)
    .join(" ");

  return haystack.includes(q);
}

export function applyAssetListFilters(
  assets: Asset[],
  params: AssetListParams,
  facilityNameById: Map<string, string> = new Map()
): Asset[] {
  const status = params.status;
  const category = params.category;
  const facility = params.facility;

  return assets.filter((asset) => {
    const matchesSearch = assetMatchesSearch(
      asset,
      params.search,
      facilityNameById
    );

    const matchesStatus =
      !status ||
      status === "all" ||
      normalize(asset.status) === normalize(status);

    const matchesCategory =
      !category ||
      category === "all" ||
      normalize(asset.category) === normalize(category);

    const matchesFacility = assetMatchesFacility(
      asset.facility,
      facility,
      facilityNameById
    );

    return (
      matchesSearch && matchesStatus && matchesCategory && matchesFacility
    );
  });
}

export function paginateAssets(
  assets: Asset[],
  params: AssetListParams
): PaginatedResult<Asset> {
  const pageSize = Math.max(1, Number(params.pageSize ?? 8));
  let page = Math.max(1, Number(params.page ?? 1));
  const total = assets.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * pageSize;

  return {
    data: assets.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}

/**
 * Canonical list pipeline:
 * all assets → sort newest first → search → filters → paginate
 */
export function queryAssetsPage(
  assets: Asset[],
  params: AssetListParams = {},
  facilityNameById: Map<string, string> = new Map()
): PaginatedResult<Asset> {
  const sorted = sortAssetsNewestFirst(assets);
  const filtered = applyAssetListFilters(sorted, params, facilityNameById);
  return paginateAssets(filtered, params);
}
