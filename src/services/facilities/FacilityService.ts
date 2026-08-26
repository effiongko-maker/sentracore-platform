import type { PaginatedResult } from "@/types";
import type {
  CreateFacilityInput,
  Facility,
  FacilityListParams,
  FacilityStatus,
  FacilityType,
  UpdateFacilityInput,
} from "@/modules/facilities/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onFacilityMutation,
} from "@/services/cache/domainCache";
import {
  CATALOG_TTL_MS,
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

/** Raw row shape from the Apps Script facilities API. */
type RemoteFacility = Record<string, unknown>;

function pickField(raw: RemoteFacility, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function mapRemoteFacility(raw: RemoteFacility): Facility {
  const id = String(pickField(raw, "id", "Facility ID") ?? "");
  const type = String(pickField(raw, "type", "Facility Type") ?? "office")
    .toLowerCase()
    .replace(/\s+/g, "_") as FacilityType;
  const status = String(pickField(raw, "status", "Status") ?? "pending")
    .toLowerCase()
    .replace(/\s+/g, "_") as FacilityStatus;

  return {
    id,
    name: String(pickField(raw, "name", "Facility Name") ?? ""),
    // No Code column in live sheet — temporarily use Facility ID.
    code: String(pickField(raw, "code", "Code", "Facility ID") ?? id),
    location: String(pickField(raw, "location", "Address") ?? ""),
    type,
    manager: String(pickField(raw, "manager", "FM Manager") ?? ""),
    status,
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

function toPaginatedFacilities(
  payload: unknown,
  params: FacilityListParams
): PaginatedResult<Facility> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) => mapRemoteFacility(row as RemoteFacility));
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
      data: rows.map((row) => mapRemoteFacility(row as RemoteFacility)),
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
 * Facilities domain service.
 *
 * Talks only to ApiClient — never to storage backends or UI details.
 * Mirrors UserService exactly.
 */
export const FacilityService = {
  async listFacilities(
    params: FacilityListParams = {}
  ): Promise<PaginatedResult<Facility>> {
    const key = stableRequestKey(CacheNamespaces.facilities, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      status: params.status ?? "all",
      type: params.type ?? "all",
    });
    return sharedRequest(
      key,
      async () => {
        const response = await apiClient.post<unknown>("/facilities", {
          resource: "facilities",
          action: "getAll",
          payload: params,
        });
        return toPaginatedFacilities(response.data, params);
      },
      { ttlMs: CATALOG_TTL_MS }
    );
  },

  async getFacility(id: string): Promise<Facility | null> {
    try {
      const response = await apiClient.get<Facility>(`/facilities/${id}`);
      return response.data;
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createFacility(input: CreateFacilityInput): Promise<Facility> {
    const response = await apiClient.post<Facility>("/facilities", {
      resource: "facilities",
      action: "create",
      payload: input,
    });
    onFacilityMutation();
    return mapRemoteFacility(response.data as unknown as RemoteFacility);
  },

  async updateFacility(
    id: string,
    input: UpdateFacilityInput
  ): Promise<Facility> {
    const response = await apiClient.post<Facility>("/facilities", {
      resource: "facilities",
      action: "update",
      payload: { id, ...input },
    });
    onFacilityMutation();
    return mapRemoteFacility(response.data as unknown as RemoteFacility);
  },

  /** Soft-deactivate only — facilities are never deleted. */
  async deactivateFacility(id: string): Promise<Facility> {
    const response = await apiClient.post<Facility>("/facilities", {
      resource: "facilities",
      action: "deactivate",
      payload: { id },
    });
    onFacilityMutation();
    return mapRemoteFacility(response.data as unknown as RemoteFacility);
  },
};

export type IFacilityService = typeof FacilityService;
