import type { PaginatedResult } from "@/types";
import type {
  CreateDieselUsageInput,
  DieselUsage,
  DieselUsageListParams,
  UpdateDieselUsageInput,
} from "@/modules/diesel-usage/types";
import { calculateDieselConsumption } from "@/modules/diesel-usage/utils";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onDieselUsageMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";
import { readRecordOrigin } from "@/services/recordOrigin";

/** Raw row shape from the diesel-usage API. */
type RemoteDieselUsage = Record<string, unknown>;

function pickField(raw: RemoteDieselUsage, ...keys: string[]): unknown {
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

function toOptionalNumber(value: unknown): number | undefined {
  if (value == null || String(value).trim() === "") return undefined;
  const n = Number(value);
  return Number.isFinite(n) ? n : undefined;
}

function mapRemoteDieselUsage(raw: RemoteDieselUsage): DieselUsage {
  const openingLevel = toNumber(
    pickField(raw, "openingLevel", "Opening Level")
  );
  const closingLevel = toNumber(
    pickField(raw, "closingLevel", "Closing Level")
  );
  const added = toOptionalNumber(pickField(raw, "added", "Added"));
  const storedConsumption = pickField(raw, "consumption", "Consumption");
  const consumption =
    storedConsumption != null && String(storedConsumption).trim() !== ""
      ? toNumber(storedConsumption)
      : calculateDieselConsumption(openingLevel, closingLevel, added);

  const createdBy = pickField(raw, "createdByUserId", "Created By");
  const updatedBy = pickField(raw, "updatedByUserId", "Updated By");

  return {
    id: String(pickField(raw, "id", "Diesel Usage ID") ?? ""),
    date: String(pickField(raw, "date", "Date") ?? "").slice(0, 10),
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    generatorId: String(pickField(raw, "generatorId", "Generator ID") ?? ""),
    openingLevel,
    ...(added != null ? { added } : {}),
    closingLevel,
    consumption,
    recordOrigin: readRecordOrigin(raw),
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

function toPaginatedDieselUsage(
  payload: unknown,
  params: DieselUsageListParams
): PaginatedResult<DieselUsage> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteDieselUsage(row as RemoteDieselUsage)
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
      data: rows.map((row) => mapRemoteDieselUsage(row as RemoteDieselUsage)),
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

/** Drop consumption if a caller accidentally includes it on create/update. */
function withoutManualConsumption<T extends Record<string, unknown>>(
  input: T
): T {
  if (!("consumption" in input)) return input;
  const { consumption: _ignored, ...rest } = input;
  return rest as T;
}

/**
 * Diesel Usage domain service.
 * Talks only to ApiClient — mirrors GeneratorLogService / EnergyReadingService.
 */
export const DieselUsageService = {
  async listDieselUsage(
    params: DieselUsageListParams = {},
    options?: { signal?: AbortSignal }
  ): Promise<PaginatedResult<DieselUsage>> {
    const key = stableRequestKey(CacheNamespaces.dieselUsageList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      facilityId: params.facilityId ?? "all",
      generatorId: params.generatorId ?? "all",
      dateFrom: params.dateFrom ?? "",
      dateTo: params.dateTo ?? "",
      sort: params.sort ?? "newest",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>(
        "/diesel-usage",
        {
          resource: "diesel-usage",
          action: "getAll",
          payload: params,
        },
        { signal: options?.signal }
      );
      return toPaginatedDieselUsage(response.data, params);
    });
  },

  async getDieselUsage(id: string): Promise<DieselUsage | null> {
    try {
      const response = await apiClient.post<DieselUsage>("/diesel-usage", {
        resource: "diesel-usage",
        action: "getById",
        payload: { id },
      });
      return mapRemoteDieselUsage(
        response.data as unknown as RemoteDieselUsage
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

  async createDieselUsage(
    input: CreateDieselUsageInput
  ): Promise<DieselUsage> {
    const payload = withoutManualConsumption(
      input as CreateDieselUsageInput & Record<string, unknown>
    );
    const response = await apiClient.post<DieselUsage>("/diesel-usage", {
      resource: "diesel-usage",
      action: "create",
      payload,
    });
    onDieselUsageMutation();
    return mapRemoteDieselUsage(
      response.data as unknown as RemoteDieselUsage
    );
  },

  async updateDieselUsage(
    id: string,
    input: Omit<UpdateDieselUsageInput, "id">
  ): Promise<DieselUsage> {
    const payload = withoutManualConsumption({
      id,
      ...(input as Record<string, unknown>),
    });
    const response = await apiClient.post<DieselUsage>("/diesel-usage", {
      resource: "diesel-usage",
      action: "update",
      payload,
    });
    onDieselUsageMutation();
    return mapRemoteDieselUsage(
      response.data as unknown as RemoteDieselUsage
    );
  },
};

export type IDieselUsageService = typeof DieselUsageService;
