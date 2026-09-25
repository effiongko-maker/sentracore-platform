import type { PaginatedResult } from "@/types";
import type {
  CreateGeneratorLogInput,
  GeneratorLog,
  GeneratorLogListParams,
  UpdateGeneratorLogInput,
} from "@/modules/generator-log/types";
import { calculateRunHoursFromReadings } from "@/modules/generator-log/utils";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onGeneratorLogMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

/** Raw row shape from the generator-log API. */
type RemoteGeneratorLog = Record<string, unknown>;

function pickField(raw: RemoteGeneratorLog, ...keys: string[]): unknown {
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

function toNumberOrNull(value: unknown): number | null {
  if (value == null || String(value).trim() === "") return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapRemoteGeneratorLog(raw: RemoteGeneratorLog): GeneratorLog {
  const startedAt = pickField(raw, "startedAt", "Start");
  const endedAt = pickField(raw, "endedAt", "End");
  const startMeterReading = toNumberOrNull(pickField(raw, "startMeterReading"));
  const endMeterReading = toNumberOrNull(pickField(raw, "endMeterReading"));
  const logBasis = pickField(raw, "logBasis") === "clock_times" ? "clock_times" : "hour_meter";
  // Run hours are the database's derivation; the readings are the fallback, never clock arithmetic.
  const storedHours = pickField(raw, "hours", "Hours");
  const hours =
    storedHours != null && String(storedHours).trim() !== ""
      ? toNumber(storedHours)
      : calculateRunHoursFromReadings(startMeterReading, endMeterReading) ?? 0;

  const remarksRaw = pickField(raw, "remarks", "Remarks");
  const createdBy = pickField(raw, "createdByUserId", "Created By");
  const updatedBy = pickField(raw, "updatedByUserId", "Updated By");

  return {
    id: String(pickField(raw, "id", "Generator Log ID") ?? ""),
    date: String(pickField(raw, "date", "Date") ?? "").slice(0, 10),
    generator: String(pickField(raw, "generator", "Generator") ?? ""),
    startMeterReading,
    endMeterReading,
    hours,
    // Not recorded stays null — never coerced to 0.
    fuelUsed: toNumberOrNull(pickField(raw, "fuelUsed", "Fuel Used")),
    logBasis,
    startedAt: startedAt == null ? null : String(startedAt),
    endedAt: endedAt == null ? null : String(endedAt),
    recordOrigin: pickField(raw, "recordOrigin") === "migrated_historical" ? "migrated_historical" : "operational",
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

function toPaginatedGeneratorLogs(
  payload: unknown,
  params: GeneratorLogListParams
): PaginatedResult<GeneratorLog> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteGeneratorLog(row as RemoteGeneratorLog)
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
        mapRemoteGeneratorLog(row as RemoteGeneratorLog)
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

/** Drop hours if a caller accidentally includes it on create/update payloads. */
function withoutManualHours<T extends Record<string, unknown>>(input: T): T {
  if (!("hours" in input)) return input;
  const { hours: _ignored, ...rest } = input;
  return rest as T;
}

/**
 * Generator Log domain service.
 * Talks only to ApiClient — mirrors FacilityService / WorkOrderService.
 */
export const GeneratorLogService = {
  async listGeneratorLogs(
    params: GeneratorLogListParams = {},
    options?: { signal?: AbortSignal }
  ): Promise<PaginatedResult<GeneratorLog>> {
    const key = stableRequestKey(CacheNamespaces.generatorLogsList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      generator: params.generator ?? "all",
      dateFrom: params.dateFrom ?? "",
      dateTo: params.dateTo ?? "",
      sort: params.sort ?? "newest",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>(
        "/generator-log",
        {
          resource: "generator-log",
          action: "getAll",
          payload: params,
        },
        { signal: options?.signal }
      );
      return toPaginatedGeneratorLogs(response.data, params);
    });
  },

  async getGeneratorLog(id: string): Promise<GeneratorLog | null> {
    try {
      const response = await apiClient.post<GeneratorLog>("/generator-log", {
        resource: "generator-log",
        action: "getById",
        payload: { id },
      });
      return mapRemoteGeneratorLog(
        response.data as unknown as RemoteGeneratorLog
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

  async createGeneratorLog(
    input: CreateGeneratorLogInput
  ): Promise<GeneratorLog> {
    const payload = withoutManualHours(
      input as CreateGeneratorLogInput & Record<string, unknown>
    );
    const response = await apiClient.post<GeneratorLog>("/generator-log", {
      resource: "generator-log",
      action: "create",
      payload,
    });
    onGeneratorLogMutation();
    return mapRemoteGeneratorLog(
      response.data as unknown as RemoteGeneratorLog
    );
  },

  async updateGeneratorLog(
    id: string,
    input: Omit<UpdateGeneratorLogInput, "id">
  ): Promise<GeneratorLog> {
    const payload = withoutManualHours({
      id,
      ...(input as Record<string, unknown>),
    });
    const response = await apiClient.post<GeneratorLog>("/generator-log", {
      resource: "generator-log",
      action: "update",
      payload,
    });
    onGeneratorLogMutation();
    return mapRemoteGeneratorLog(
      response.data as unknown as RemoteGeneratorLog
    );
  },
};

export type IGeneratorLogService = typeof GeneratorLogService;
