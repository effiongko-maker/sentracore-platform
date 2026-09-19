import type { PaginatedResult } from "@/types";
import type {
  CreateFumigationLogInput,
  FumigationLog,
  FumigationLogListParams,
  UpdateFumigationLogInput,
} from "@/modules/fumigation-log/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onFumigationLogMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

/** Raw row shape from the fumigation-log API. */
type RemoteFumigationLog = Record<string, unknown>;

function pickField(raw: RemoteFumigationLog, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function mapRemoteFumigationLog(raw: RemoteFumigationLog): FumigationLog {
  const remarksRaw = pickField(raw, "remarks", "Remarks");
  const createdBy = pickField(raw, "createdByUserId", "Created By");
  const updatedBy = pickField(raw, "updatedByUserId", "Updated By");

  return {
    id: String(pickField(raw, "id", "Log ID", "Fumigation Log ID") ?? ""),
    date: String(pickField(raw, "date", "Date") ?? "").slice(0, 10),
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    areaTreated: String(pickField(raw, "areaTreated", "Area Treated") ?? ""),
    pestType: String(pickField(raw, "pestType", "Pest Type") ?? ""),
    vendor: String(pickField(raw, "vendor", "Vendor") ?? ""),
    nextDueDate: String(
      pickField(raw, "nextDueDate", "Next Due Date") ?? ""
    ).slice(0, 10),
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

function toPaginatedFumigationLogs(
  payload: unknown,
  params: FumigationLogListParams
): PaginatedResult<FumigationLog> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteFumigationLog(row as RemoteFumigationLog)
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
        mapRemoteFumigationLog(row as RemoteFumigationLog)
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
 * Fumigation Log domain service.
 * Talks only to ApiClient — mirrors WasteLogService.
 */
export const FumigationLogService = {
  async listFumigationLogs(
    params: FumigationLogListParams = {},
    options?: { signal?: AbortSignal }
  ): Promise<PaginatedResult<FumigationLog>> {
    const key = stableRequestKey(CacheNamespaces.fumigationLogsList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      facilityId: params.facilityId ?? "all",
      dateFrom: params.dateFrom ?? "",
      dateTo: params.dateTo ?? "",
      nextDueFrom: params.nextDueFrom ?? "",
      nextDueTo: params.nextDueTo ?? "",
      sort: params.sort ?? "newest",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>(
        "/fumigation-log",
        {
          resource: "fumigation-log",
          action: "getAll",
          payload: params,
        },
        { signal: options?.signal }
      );
      return toPaginatedFumigationLogs(response.data, params);
    });
  },

  async getFumigationLog(id: string): Promise<FumigationLog | null> {
    try {
      const response = await apiClient.post<FumigationLog>("/fumigation-log", {
        resource: "fumigation-log",
        action: "getById",
        payload: { id },
      });
      return mapRemoteFumigationLog(
        response.data as unknown as RemoteFumigationLog
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

  async createFumigationLog(
    input: CreateFumigationLogInput
  ): Promise<FumigationLog> {
    const response = await apiClient.post<FumigationLog>("/fumigation-log", {
      resource: "fumigation-log",
      action: "create",
      payload: input,
    });
    onFumigationLogMutation();
    return mapRemoteFumigationLog(
      response.data as unknown as RemoteFumigationLog
    );
  },

  async updateFumigationLog(
    id: string,
    input: Omit<UpdateFumigationLogInput, "id">
  ): Promise<FumigationLog> {
    const response = await apiClient.post<FumigationLog>("/fumigation-log", {
      resource: "fumigation-log",
      action: "update",
      payload: { id, ...input },
    });
    onFumigationLogMutation();
    return mapRemoteFumigationLog(
      response.data as unknown as RemoteFumigationLog
    );
  },
};

export type IFumigationLogService = typeof FumigationLogService;
