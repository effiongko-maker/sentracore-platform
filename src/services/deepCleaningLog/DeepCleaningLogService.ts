import type { PaginatedResult } from "@/types";
import type {
  CreateDeepCleaningLogInput,
  DeepCleaningLog,
  DeepCleaningLogListParams,
  UpdateDeepCleaningLogInput,
} from "@/modules/deep-cleaning-log/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onDeepCleaningLogMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

/** Raw row shape from the deep-cleaning-log API. */
type RemoteDeepCleaningLog = Record<string, unknown>;

function pickField(raw: RemoteDeepCleaningLog, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function mapRemoteDeepCleaningLog(raw: RemoteDeepCleaningLog): DeepCleaningLog {
  const remarksRaw = pickField(raw, "remarks", "Remarks");
  const createdBy = pickField(raw, "createdByUserId", "Created By");
  const updatedBy = pickField(raw, "updatedByUserId", "Updated By");

  return {
    id: String(pickField(raw, "id", "Log ID", "Deep Cleaning Log ID") ?? ""),
    date: String(pickField(raw, "date", "Date") ?? "").slice(0, 10),
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    area: String(pickField(raw, "area", "Area") ?? ""),
    vendorTeam: String(
      pickField(raw, "vendorTeam", "Vendor/Team", "Vendor") ?? ""
    ),
    status: String(pickField(raw, "status", "Status") ?? ""),
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

function toPaginatedDeepCleaningLogs(
  payload: unknown,
  params: DeepCleaningLogListParams
): PaginatedResult<DeepCleaningLog> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteDeepCleaningLog(row as RemoteDeepCleaningLog)
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
      data: rows.map((row) =>
        mapRemoteDeepCleaningLog(row as RemoteDeepCleaningLog)
      ),
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
 * Deep Cleaning Log domain service.
 * Talks only to ApiClient — mirrors WasteLogService / FumigationLogService.
 */
export const DeepCleaningLogService = {
  async listDeepCleaningLogs(
    params: DeepCleaningLogListParams = {},
    options?: { signal?: AbortSignal }
  ): Promise<PaginatedResult<DeepCleaningLog>> {
    const key = stableRequestKey(CacheNamespaces.deepCleaningLogsList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      facilityId: params.facilityId ?? "all",
      status: params.status ?? "all",
      dateFrom: params.dateFrom ?? "",
      dateTo: params.dateTo ?? "",
      sort: params.sort ?? "newest",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>(
        "/deep-cleaning-log",
        {
          resource: "deep-cleaning-log",
          action: "getAll",
          payload: params,
        },
        { signal: options?.signal }
      );
      return toPaginatedDeepCleaningLogs(response.data, params);
    });
  },

  async getDeepCleaningLog(id: string): Promise<DeepCleaningLog | null> {
    try {
      const response = await apiClient.post<DeepCleaningLog>(
        "/deep-cleaning-log",
        {
          resource: "deep-cleaning-log",
          action: "getById",
          payload: { id },
        }
      );
      return mapRemoteDeepCleaningLog(
        response.data as unknown as RemoteDeepCleaningLog
      );
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

  async createDeepCleaningLog(
    input: CreateDeepCleaningLogInput
  ): Promise<DeepCleaningLog> {
    const response = await apiClient.post<DeepCleaningLog>(
      "/deep-cleaning-log",
      {
        resource: "deep-cleaning-log",
        action: "create",
        payload: input,
      }
    );
    onDeepCleaningLogMutation();
    return mapRemoteDeepCleaningLog(
      response.data as unknown as RemoteDeepCleaningLog
    );
  },

  async updateDeepCleaningLog(
    id: string,
    input: Omit<UpdateDeepCleaningLogInput, "id">
  ): Promise<DeepCleaningLog> {
    const response = await apiClient.post<DeepCleaningLog>(
      "/deep-cleaning-log",
      {
        resource: "deep-cleaning-log",
        action: "update",
        payload: { id, ...input },
      }
    );
    onDeepCleaningLogMutation();
    return mapRemoteDeepCleaningLog(
      response.data as unknown as RemoteDeepCleaningLog
    );
  },
};

export type IDeepCleaningLogService = typeof DeepCleaningLogService;
