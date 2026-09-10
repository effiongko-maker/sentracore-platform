import type { PaginatedResult } from "@/types";
import type {
  ConsumablesUpdate,
  ConsumablesUpdateListParams,
  CreateConsumablesUpdateInput,
  UpdateConsumablesUpdateInput,
} from "@/modules/consumables-update/types";
import { calculateConsumablesClosing } from "@/modules/consumables-update/utils";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onConsumablesUpdateMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

type RemoteConsumablesUpdate = Record<string, unknown>;

function pickField(raw: RemoteConsumablesUpdate, ...keys: string[]): unknown {
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

function mapRemoteConsumablesUpdate(
  raw: RemoteConsumablesUpdate
): ConsumablesUpdate {
  const opening = toNumber(pickField(raw, "opening", "Opening"));
  const issued = toNumber(pickField(raw, "issued", "Issued"));
  const received = toOptionalNumber(pickField(raw, "received", "Received"));
  const storedClosing = pickField(raw, "closing", "Closing");
  const closing =
    storedClosing != null && String(storedClosing).trim() !== ""
      ? toNumber(storedClosing)
      : calculateConsumablesClosing(opening, issued, received);

  const reorderLevel = toOptionalNumber(
    pickField(raw, "reorderLevel", "Reorder Level")
  );
  const createdBy = pickField(raw, "createdByUserId", "Created By");
  const updatedBy = pickField(raw, "updatedByUserId", "Updated By");

  return {
    id: String(pickField(raw, "id", "Consumables Update ID") ?? ""),
    itemId: String(pickField(raw, "itemId", "Item ID") ?? ""),
    date: String(pickField(raw, "date", "Date") ?? "").slice(0, 10),
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    itemName: String(pickField(raw, "itemName", "Item Name") ?? ""),
    opening,
    ...(received != null ? { received } : {}),
    issued,
    closing,
    ...(reorderLevel != null ? { reorderLevel } : {}),
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

function toPaginatedConsumablesUpdates(
  payload: unknown,
  params: ConsumablesUpdateListParams
): PaginatedResult<ConsumablesUpdate> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteConsumablesUpdate(row as RemoteConsumablesUpdate)
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
        mapRemoteConsumablesUpdate(row as RemoteConsumablesUpdate)
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

function withoutManualClosing<T extends Record<string, unknown>>(input: T): T {
  if (!("closing" in input) && !("itemId" in input)) return input;
  const { closing: _c, itemId: _i, ...rest } = input as T & {
    closing?: unknown;
    itemId?: unknown;
  };
  return rest as T;
}

export const ConsumablesUpdateService = {
  async listConsumablesUpdates(
    params: ConsumablesUpdateListParams = {},
    options?: { signal?: AbortSignal }
  ): Promise<PaginatedResult<ConsumablesUpdate>> {
    const key = stableRequestKey(CacheNamespaces.consumablesUpdatesList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      facilityId: params.facilityId ?? "all",
      itemName: params.itemName ?? "all",
      itemId: params.itemId ?? "all",
      dateFrom: params.dateFrom ?? "",
      dateTo: params.dateTo ?? "",
      sort: params.sort ?? "newest",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>(
        "/consumables-update",
        {
          resource: "consumables-update",
          action: "getAll",
          payload: params,
        },
        { signal: options?.signal }
      );
      return toPaginatedConsumablesUpdates(response.data, params);
    });
  },

  async getConsumablesUpdate(id: string): Promise<ConsumablesUpdate | null> {
    try {
      const response = await apiClient.post<ConsumablesUpdate>(
        "/consumables-update",
        {
          resource: "consumables-update",
          action: "getById",
          payload: { id },
        }
      );
      return mapRemoteConsumablesUpdate(
        response.data as unknown as RemoteConsumablesUpdate
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

  async createConsumablesUpdate(
    input: CreateConsumablesUpdateInput
  ): Promise<ConsumablesUpdate> {
    const payload = withoutManualClosing(
      input as CreateConsumablesUpdateInput & Record<string, unknown>
    );
    const response = await apiClient.post<ConsumablesUpdate>(
      "/consumables-update",
      {
        resource: "consumables-update",
        action: "create",
        payload,
      }
    );
    onConsumablesUpdateMutation();
    return mapRemoteConsumablesUpdate(
      response.data as unknown as RemoteConsumablesUpdate
    );
  },

  async updateConsumablesUpdate(
    id: string,
    input: Omit<UpdateConsumablesUpdateInput, "id">
  ): Promise<ConsumablesUpdate> {
    const payload = withoutManualClosing({
      id,
      ...(input as Record<string, unknown>),
    });
    const response = await apiClient.post<ConsumablesUpdate>(
      "/consumables-update",
      {
        resource: "consumables-update",
        action: "update",
        payload,
      }
    );
    onConsumablesUpdateMutation();
    return mapRemoteConsumablesUpdate(
      response.data as unknown as RemoteConsumablesUpdate
    );
  },
};

export type IConsumablesUpdateService = typeof ConsumablesUpdateService;
