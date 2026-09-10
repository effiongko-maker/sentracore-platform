import type { PaginatedResult } from "@/types";
import type {
  CreateEnergyReadingInput,
  EnergyReading,
  EnergyReadingListParams,
  UpdateEnergyReadingInput,
} from "@/modules/energy-reading/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onEnergyReadingMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

/** Raw row shape from the Apps Script energy-reading API. */
type RemoteEnergyReading = Record<string, unknown>;

function pickField(raw: RemoteEnergyReading, ...keys: string[]): unknown {
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

function mapRemoteEnergyReading(raw: RemoteEnergyReading): EnergyReading {
  const remarksRaw = pickField(raw, "remarks", "Remarks");
  const createdBy = pickField(raw, "createdByUserId", "Created By");
  const updatedBy = pickField(raw, "updatedByUserId", "Updated By");

  return {
    id: String(pickField(raw, "id", "Energy Reading ID") ?? ""),
    date: String(pickField(raw, "date", "Date") ?? "").slice(0, 10),
    meter: String(pickField(raw, "meter", "Meter") ?? ""),
    reading: toNumber(pickField(raw, "reading", "Reading")),
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

function toPaginatedEnergyReadings(
  payload: unknown,
  params: EnergyReadingListParams
): PaginatedResult<EnergyReading> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteEnergyReading(row as RemoteEnergyReading)
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
        mapRemoteEnergyReading(row as RemoteEnergyReading)
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
 * Energy Reading domain service.
 * Talks only to ApiClient — mirrors GeneratorLogService.
 */
export const EnergyReadingService = {
  async listEnergyReadings(
    params: EnergyReadingListParams = {},
    options?: { signal?: AbortSignal }
  ): Promise<PaginatedResult<EnergyReading>> {
    const key = stableRequestKey(CacheNamespaces.energyReadingsList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      meter: params.meter ?? "all",
      dateFrom: params.dateFrom ?? "",
      dateTo: params.dateTo ?? "",
      sort: params.sort ?? "newest",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>(
        "/energy-reading",
        {
          resource: "energy-reading",
          action: "getAll",
          payload: params,
        },
        { signal: options?.signal }
      );
      return toPaginatedEnergyReadings(response.data, params);
    });
  },

  async getEnergyReading(id: string): Promise<EnergyReading | null> {
    try {
      const response = await apiClient.post<EnergyReading>("/energy-reading", {
        resource: "energy-reading",
        action: "getById",
        payload: { id },
      });
      return mapRemoteEnergyReading(
        response.data as unknown as RemoteEnergyReading
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

  async createEnergyReading(
    input: CreateEnergyReadingInput
  ): Promise<EnergyReading> {
    const response = await apiClient.post<EnergyReading>("/energy-reading", {
      resource: "energy-reading",
      action: "create",
      payload: input,
    });
    onEnergyReadingMutation();
    return mapRemoteEnergyReading(
      response.data as unknown as RemoteEnergyReading
    );
  },

  async updateEnergyReading(
    id: string,
    input: Omit<UpdateEnergyReadingInput, "id">
  ): Promise<EnergyReading> {
    const response = await apiClient.post<EnergyReading>("/energy-reading", {
      resource: "energy-reading",
      action: "update",
      payload: { id, ...input },
    });
    onEnergyReadingMutation();
    return mapRemoteEnergyReading(
      response.data as unknown as RemoteEnergyReading
    );
  },
};

export type IEnergyReadingService = typeof EnergyReadingService;
