import type { PaginatedResult } from "@/types";
import type {
  CreateMasterDataInput,
  MasterDataItem,
  MasterDataListParams,
  MasterDataStatus,
  UpdateMasterDataInput,
} from "@/modules/master-data/types";
import { apiClient } from "@/services/api/ApiClient";

type RemoteItem = Record<string, unknown>;

function pickField(raw: RemoteItem, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

/**
 * Normalize live aliases (facility/building/floor) onto the canonical
 * facilityId/buildingId/floorId model used by Master Data + Requests.
 */
export function normalizeMasterDataItem(raw: RemoteItem): MasterDataItem {
  const status = String(raw.status ?? "active")
    .toLowerCase()
    .replace(/\s+/g, "_") as MasterDataStatus;

  const facilityId = pickField(raw, "facilityId", "facility", "Facility");
  const buildingId = pickField(raw, "buildingId", "building", "Building");
  const floorId = pickField(raw, "floorId", "floor", "Floor");

  return {
    id: String(pickField(raw, "id", "ID") ?? ""),
    name: String(pickField(raw, "name", "Name") ?? ""),
    code: String(pickField(raw, "code", "Code") ?? ""),
    status,
    description: (() => {
      const value = pickField(raw, "description", "Description");
      return value != null ? String(value) : undefined;
    })(),
    facilityId: facilityId != null ? String(facilityId).trim() : undefined,
    buildingId: buildingId != null ? String(buildingId).trim() : undefined,
    floorId: floorId != null ? String(floorId).trim() : undefined,
    level:
      raw.level != null && String(raw.level) !== ""
        ? String(raw.level)
        : undefined,
    category: (() => {
      const value = pickField(raw, "category", "Category");
      return value != null ? String(value) : undefined;
    })(),
    contactName: (() => {
      const value = pickField(raw, "contactName", "Contact Name");
      return value != null ? String(value) : undefined;
    })(),
    email: (() => {
      const value = pickField(raw, "email", "Email");
      return value != null ? String(value) : undefined;
    })(),
    phone: (() => {
      const value = pickField(raw, "phone", "Phone");
      return value != null ? String(value) : undefined;
    })(),
    createdAt: String(
      pickField(raw, "createdAt", "Date Added") ?? new Date().toISOString()
    ),
    updatedAt: String(
      pickField(raw, "updatedAt", "Date Added") ?? new Date().toISOString()
    ),
  };
}

/** @deprecated Prefer normalizeMasterDataItem — kept for local call sites. */
function mapRemoteItem(raw: RemoteItem): MasterDataItem {
  return normalizeMasterDataItem(raw);
}

/**
 * Live Apps Script sheets use facility/building/floor column names.
 * Include both camelId and short aliases so either schema accepts writes.
 */
function relationWriteAliases(input: {
  facilityId?: string;
  buildingId?: string;
  floorId?: string;
}) {
  const facility = input.facilityId?.trim() || undefined;
  const building = input.buildingId?.trim() || undefined;
  const floor = input.floorId?.trim() || undefined;
  return {
    facilityId: facility,
    facility,
    buildingId: building,
    building,
    floorId: floor,
    floor,
  };
}

function hasRelationFilter(value: string | "all" | undefined): value is string {
  return Boolean(value && value !== "all");
}

/**
 * Cascade filters against the normalized model only.
 * Never compare IDs to names/objects.
 */
export function filterMasterDataByRelations(
  items: MasterDataItem[],
  params: Pick<
    MasterDataListParams,
    "facilityId" | "buildingId" | "floorId" | "category" | "status" | "search"
  >
): MasterDataItem[] {
  const facilityId = hasRelationFilter(params.facilityId)
    ? params.facilityId.trim()
    : undefined;
  const buildingId = hasRelationFilter(params.buildingId)
    ? params.buildingId.trim()
    : undefined;
  const floorId = hasRelationFilter(params.floorId)
    ? params.floorId.trim()
    : undefined;
  const category = hasRelationFilter(params.category)
    ? params.category.trim().toLowerCase()
    : undefined;
  const status =
    params.status && params.status !== "all"
      ? String(params.status).toLowerCase()
      : undefined;
  const search = String(params.search ?? "")
    .trim()
    .toLowerCase();

  return items.filter((item) => {
    if (facilityId && item.facilityId !== facilityId) return false;
    if (buildingId && item.buildingId !== buildingId) return false;
    if (floorId && item.floorId !== floorId) return false;
    if (category && String(item.category ?? "").toLowerCase() !== category) {
      return false;
    }
    if (status && String(item.status ?? "").toLowerCase() !== status) {
      return false;
    }
    if (search) {
      const haystack = [
        item.name,
        item.code,
        item.category,
        item.contactName,
        item.email,
        item.id,
      ]
        .map((value) => String(value ?? "").toLowerCase())
        .join(" ");
      if (!haystack.includes(search)) return false;
    }
    return true;
  });
}

function paginateItems(
  items: MasterDataItem[],
  params: MasterDataListParams
): PaginatedResult<MasterDataItem> {
  const pageSize = Math.max(1, Number(params.pageSize ?? 10));
  let page = Math.max(1, Number(params.page ?? 1));
  const total = items.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (page > totalPages) page = totalPages;
  const start = (page - 1) * pageSize;

  return {
    data: items.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages,
  };
}

function extractRemoteRows(payload: unknown): RemoteItem[] {
  if (Array.isArray(payload)) {
    return payload as RemoteItem[];
  }
  if (payload && typeof payload === "object") {
    const page = payload as Record<string, unknown>;
    if (Array.isArray(page.data)) return page.data as RemoteItem[];
  }
  return [];
}

/**
 * Master Data domain service.
 *
 * Live Apps Script envelope: { resource: "master-data", action, payload }.
 * Payload always includes entity: departments|buildings|floors|rooms|vendors.
 *
 * Relationship cascade (Facility → Building → Floor → Room) is applied on the
 * normalized client model so live aliases (facility/building/floor) work even
 * when the deployed Apps Script still filters only on *Id fields.
 */
export const MasterDataService = {
  async list(
    params: MasterDataListParams
  ): Promise<PaginatedResult<MasterDataItem>> {
    const needsClientCascade =
      hasRelationFilter(params.facilityId) ||
      hasRelationFilter(params.buildingId) ||
      hasRelationFilter(params.floorId);

    // When cascading, do not trust server-side facilityId filters — live rows
    // store `facility`, so undeployed scripts return []. Fetch a wide page and
    // filter on the normalized model instead.
    const remotePayload: MasterDataListParams = needsClientCascade
      ? {
          entity: params.entity,
          page: 1,
          pageSize: Math.max(Number(params.pageSize ?? 200), 500),
          search: "",
          status: "all",
        }
      : params;

    const response = await apiClient.post<unknown>("/master-data", {
      resource: "master-data",
      action: "getAll",
      payload: remotePayload,
    });

    const normalized = extractRemoteRows(response.data).map(
      normalizeMasterDataItem
    );
    const filtered = filterMasterDataByRelations(normalized, params);

    if (
      process.env.NODE_ENV === "development" &&
      params.entity === "buildings" &&
      hasRelationFilter(params.facilityId)
    ) {
      console.log("[MasterDataService] Selected facility:", params.facilityId);
      console.log(
        "[MasterDataService] Buildings (normalized):",
        filtered.map((item) => ({
          id: item.id,
          name: item.name,
          facilityId: item.facilityId,
        }))
      );
    }

    if (needsClientCascade) {
      return paginateItems(filtered, params);
    }

    // Server already paginated; still normalize relation fields on each row.
    if (response.data && typeof response.data === "object") {
      const page = response.data as Record<string, unknown>;
      if (Array.isArray(page.data)) {
        return {
          data: (page.data as RemoteItem[]).map(normalizeMasterDataItem),
          page: Number(page.page ?? params.page ?? 1),
          pageSize: Number(page.pageSize ?? params.pageSize ?? page.data.length),
          total: Number(page.total ?? page.data.length),
          totalPages: Number(page.totalPages ?? 1),
        };
      }
    }

    return paginateItems(filtered, params);
  },

  async create(input: CreateMasterDataInput): Promise<MasterDataItem> {
    const relations = relationWriteAliases(input);
    const response = await apiClient.post<unknown>("/master-data", {
      resource: "master-data",
      action: "create",
      payload: { ...input, ...relations },
    });
    return mapRemoteItem(response.data as RemoteItem);
  },

  async update(input: UpdateMasterDataInput): Promise<MasterDataItem> {
    const relations = relationWriteAliases(input);
    const response = await apiClient.post<unknown>("/master-data", {
      resource: "master-data",
      action: "update",
      payload: { ...input, ...relations },
    });
    return mapRemoteItem(response.data as RemoteItem);
  },

  async deactivate(
    entity: CreateMasterDataInput["entity"],
    id: string
  ): Promise<MasterDataItem> {
    const response = await apiClient.post<unknown>("/master-data", {
      resource: "master-data",
      action: "deactivate",
      payload: { entity, id },
    });
    return mapRemoteItem(response.data as RemoteItem);
  },
};

export type IMasterDataService = typeof MasterDataService;
