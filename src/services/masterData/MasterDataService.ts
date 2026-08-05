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

function mapRemoteItem(raw: RemoteItem): MasterDataItem {
  const status = String(raw.status ?? "active")
    .toLowerCase()
    .replace(/\s+/g, "_") as MasterDataStatus;

  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    code: String(raw.code ?? ""),
    status,
    description: raw.description ? String(raw.description) : undefined,
    facilityId: raw.facilityId ? String(raw.facilityId) : undefined,
    buildingId: raw.buildingId ? String(raw.buildingId) : undefined,
    floorId: raw.floorId ? String(raw.floorId) : undefined,
    level: raw.level != null && String(raw.level) !== "" ? String(raw.level) : undefined,
    category: raw.category ? String(raw.category) : undefined,
    contactName: raw.contactName ? String(raw.contactName) : undefined,
    email: raw.email ? String(raw.email) : undefined,
    phone: raw.phone ? String(raw.phone) : undefined,
    createdAt: String(raw.createdAt ?? new Date().toISOString()),
    updatedAt: String(raw.updatedAt ?? new Date().toISOString()),
  };
}

function toPaginated(
  payload: unknown,
  params: MasterDataListParams
): PaginatedResult<MasterDataItem> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) => mapRemoteItem(row as RemoteItem));
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
      data: rows.map((row) => mapRemoteItem(row as RemoteItem)),
      page: Number(page.page ?? params.page ?? 1),
      pageSize: Number(page.pageSize ?? params.pageSize ?? rows.length),
      total: Number(page.total ?? rows.length),
      totalPages: Number(page.totalPages ?? 1),
    };
  }

  return {
    data: [],
    page: 1,
    pageSize: params.pageSize ?? 10,
    total: 0,
    totalPages: 1,
  };
}

/**
 * Master Data domain service.
 *
 * Live Apps Script envelope: { resource: "master-data", action, payload }.
 * Payload always includes entity: departments|buildings|floors|rooms|vendors.
 */
export const MasterDataService = {
  async list(
    params: MasterDataListParams
  ): Promise<PaginatedResult<MasterDataItem>> {
    const response = await apiClient.post<unknown>("/master-data", {
      resource: "master-data",
      action: "getAll",
      payload: params,
    });
    return toPaginated(response.data, params);
  },

  async create(input: CreateMasterDataInput): Promise<MasterDataItem> {
    const response = await apiClient.post<unknown>("/master-data", {
      resource: "master-data",
      action: "create",
      payload: input,
    });
    return mapRemoteItem(response.data as RemoteItem);
  },

  async update(input: UpdateMasterDataInput): Promise<MasterDataItem> {
    const response = await apiClient.post<unknown>("/master-data", {
      resource: "master-data",
      action: "update",
      payload: input,
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
