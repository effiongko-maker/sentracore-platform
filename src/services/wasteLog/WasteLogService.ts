import type { PaginatedResult } from "@/types";
import type {
  CreateWasteLogInput,
  UpdateWasteLogInput,
  WasteLog,
  WasteLogListParams,
} from "@/modules/waste-log/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onWasteLogMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

/** Raw row shape from the waste-log API. */
type RemoteWasteLog = Record<string, unknown>;

function pickField(raw: RemoteWasteLog, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function toNumber(value: unknown, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function mapRemoteWasteLog(raw: RemoteWasteLog): WasteLog {
  const remarksRaw = pickField(raw, "remarks", "Remarks");
  const createdBy = pickField(raw, "createdByUserId", "Created By");
  const updatedBy = pickField(raw, "updatedByUserId", "Updated By");

  return {
    id: String(pickField(raw, "id", "Log ID", "Waste Log ID") ?? ""),
    date: String(pickField(raw, "date", "Date") ?? "").slice(0, 10),
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    wasteType: String(pickField(raw, "wasteType", "Waste Type") ?? ""),
    quantity: toNumber(pickField(raw, "quantity", "Quantity")),
    unit: String(pickField(raw, "unit", "Unit") ?? ""),
    disposalMethod: String(
      pickField(raw, "disposalMethod", "Disposal Method") ?? ""
    ),
    remarks:
      remarksRaw != null && String(remarksRaw).trim() !== ""
        ? String(remarksRaw)
        : undefined,
    createdAt: String(
      pickField(raw, "createdAt", "Created At") ?? new Date().toISOString()
    ),
    updatedAt: String(
      pickField(raw, "updatedAt", "Updated At") ?? new Date().toISOString()
    ),
    createdByUserId:
      createdBy != null && String(createdBy).trim() !== ""
        ? String(createdBy)
        : undefined,
    updatedByUserId:
      updatedBy != null && String(updatedBy).trim() !== ""
        ? String(updatedBy)
        : undefined,
  };
}

function toPaginatedWasteLogs(
  payload: unknown,
  params: WasteLogListParams
): PaginatedResult<WasteLog> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteWasteLog(row as RemoteWasteLog)
    );
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
      data: rows.map((row) => mapRemoteWasteLog(row as RemoteWasteLog)),
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
 * Waste Log domain service.
 * Talks only to ApiClient — mirrors EnergyReadingService / DieselUsageService.
 */
export const WasteLogService = {
  async listWasteLogs(
    params: WasteLogListParams = {},
    options?: { signal?: AbortSignal }
  ): Promise<PaginatedResult<WasteLog>> {
    const key = stableRequestKey(CacheNamespaces.wasteLogsList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      facilityId: params.facilityId ?? "all",
      wasteType: params.wasteType ?? "all",
      dateFrom: params.dateFrom ?? "",
      dateTo: params.dateTo ?? "",
      sort: params.sort ?? "newest",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>(
        "/waste-log",
        {
          resource: "waste-log",
          action: "getAll",
          payload: params,
        },
        { signal: options?.signal }
      );
      return toPaginatedWasteLogs(response.data, params);
    });
  },

  async getWasteLog(id: string): Promise<WasteLog | null> {
    try {
      const response = await apiClient.post<WasteLog>("/waste-log", {
        resource: "waste-log",
        action: "getById",
        payload: { id },
      });
      return mapRemoteWasteLog(response.data as unknown as RemoteWasteLog);
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) return null;
      if (
        error instanceof Error &&
        (error as Error & { status?: number }).status === 404
      ) {
        return null;
      }
      throw error;
    }
  },

  async createWasteLog(input: CreateWasteLogInput): Promise<WasteLog> {
    const response = await apiClient.post<WasteLog>("/waste-log", {
      resource: "waste-log",
      action: "create",
      payload: input,
    });
    onWasteLogMutation();
    return mapRemoteWasteLog(response.data as unknown as RemoteWasteLog);
  },

  async updateWasteLog(
    id: string,
    input: Omit<UpdateWasteLogInput, "id">
  ): Promise<WasteLog> {
    const response = await apiClient.post<WasteLog>("/waste-log", {
      resource: "waste-log",
      action: "update",
      payload: { id, ...input },
    });
    onWasteLogMutation();
    return mapRemoteWasteLog(response.data as unknown as RemoteWasteLog);
  },
};

export type IWasteLogService = typeof WasteLogService;
