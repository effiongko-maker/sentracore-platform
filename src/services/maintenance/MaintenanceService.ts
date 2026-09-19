import type { PaginatedResult } from "@/types";
import type {
  CreateMaintenanceInput,
  Maintenance,
  MaintenanceCatalogEntry,
  MaintenanceCatalogListParams,
  MaintenanceListParams,
  MaintenancePriority,
  MaintenanceSource,
  MaintenanceStatus,
  MaintenanceType,
  UpdateMaintenanceInput,
} from "@/modules/maintenance/types";
import { applyWorkOrderRule } from "@/modules/maintenance/utils";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onMaintenanceMutation,
} from "@/services/cache/domainCache";
import {
  CATALOG_TTL_MS,
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

type RemoteMaintenance = Record<string, unknown>;

function pickField(raw: RemoteMaintenance, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function optionalMappedString(
  raw: RemoteMaintenance,
  ...keys: string[]
): string | undefined {
  const value = pickField(raw, ...keys);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function optionalBoolean(
  raw: RemoteMaintenance,
  ...keys: string[]
): boolean | undefined {
  const value = pickField(raw, ...keys);
  if (value == null || value === "") return undefined;
  if (typeof value === "boolean") return value;
  const text = String(value).toLowerCase();
  if (text === "true" || text === "yes" || text === "1") return true;
  if (text === "false" || text === "no" || text === "0") return false;
  return undefined;
}

function normalizeEnum(value: string) {
  return value.toLowerCase().replace(/\s+/g, "_");
}

function mapStatus(raw: string): MaintenanceStatus {
  const value = normalizeEnum(raw);
  if (value === "open" || value === "new") return "requested";
  return (value || "requested") as MaintenanceStatus;
}

/**
 * Compatibility mapper for /api/maintenance responses (Supabase fm_work).
 * workOrderIds are never authoritative on Work after Phase 2B.
 */
export function mapRemoteMaintenance(raw: RemoteMaintenance): Maintenance {
  const type = normalizeEnum(
    String(pickField(raw, "type", "Type", "Maintenance Type") ?? "corrective")
  ) as MaintenanceType;
  const source = normalizeEnum(
    String(pickField(raw, "source", "Source") ?? "manual")
  ) as MaintenanceSource;
  const priority = normalizeEnum(
    String(pickField(raw, "priority", "Priority") ?? "medium")
  ) as MaintenancePriority;
  const status = mapStatus(
    String(pickField(raw, "status", "Status") ?? "requested")
  );

  const description = optionalMappedString(raw, "description", "Description");
  const title =
    optionalMappedString(raw, "title", "Title", "Maintenance Title") || "";

  const reportedAt = String(
    pickField(raw, "reportedAt", "Reported At") ?? new Date().toISOString()
  );
  const completedAt = optionalMappedString(raw, "completedAt", "Completed At");
  const requiresWorkOrder =
    optionalBoolean(raw, "requiresWorkOrder", "Requires Work Order") ?? false;

  return applyWorkOrderRule({
    id: String(pickField(raw, "id", "Maintenance ID") ?? ""),
    workUuid: optionalMappedString(raw, "workUuid"),
    title,
    description,
    type: type || "corrective",
    source: source || "manual",
    categoryId: optionalMappedString(raw, "categoryId", "Category ID"),
    department: optionalMappedString(raw, "department", "Department"),
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    assetId: optionalMappedString(raw, "assetId", "Asset ID"),
    reportedByUserId: optionalMappedString(
      raw,
      "reportedByUserId",
      "Reported By User ID"
    ),
    assignedToUserId: optionalMappedString(
      raw,
      "assignedToUserId",
      "Assigned To User ID"
    ),
    operationalEventId: optionalMappedString(
      raw,
      "operationalEventId",
      "eventId"
    ),
    eventId: optionalMappedString(raw, "operationalEventId", "eventId"),
    incidentId: optionalMappedString(raw, "incidentId", "Incident ID"),
    workOrderId: undefined,
    workOrderIds: [],
    sourceRequestId: optionalMappedString(
      raw,
      "sourceRequestId",
      "Request ID"
    ),
    priority: priority || "medium",
    status,
    holdReason: optionalMappedString(raw, "holdReason", "Hold Reason"),
    requiresWorkOrder,
    reportedAt,
    scheduledStartAt: optionalMappedString(raw, "scheduledStartAt"),
    scheduledEndAt: optionalMappedString(raw, "scheduledEndAt"),
    dueAt: optionalMappedString(raw, "dueAt", "Due At"),
    startedAt: optionalMappedString(raw, "startedAt"),
    completedAt,
    completionNotes: optionalMappedString(raw, "completionNotes"),
    workPerformed: optionalMappedString(raw, "workPerformed"),
    createdAt: String(pickField(raw, "createdAt", "Created At") ?? reportedAt),
    updatedAt: String(
      pickField(raw, "updatedAt", "Updated At") ?? completedAt ?? reportedAt
    ),
    createdByUserId: optionalMappedString(raw, "createdByUserId"),
    updatedByUserId: optionalMappedString(raw, "updatedByUserId"),
  });
}

function toPaginatedMaintenance(
  payload: unknown,
  params: MaintenanceListParams
): PaginatedResult<Maintenance> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteMaintenance(row as RemoteMaintenance)
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
    const criticalRaw = page.criticalWorkTotal;
    const criticalWorkTotal =
      typeof criticalRaw === "number" && Number.isFinite(criticalRaw)
        ? criticalRaw
        : undefined;
    return {
      data: rows.map((row) => mapRemoteMaintenance(row as RemoteMaintenance)),
      page: Number(page.page ?? params.page ?? 1),
      pageSize: Number(page.pageSize ?? params.pageSize ?? rows.length),
      total: Number(page.total ?? rows.length),
      totalPages: Number(page.totalPages ?? 1),
      ...(criticalWorkTotal !== undefined ? { criticalWorkTotal } : {}),
      ...(page.operationalPictureMaintenance !== undefined
        ? { operationalPictureMaintenance: page.operationalPictureMaintenance }
        : {}),
    };
  }

  throw new ApiError("Work list response was malformed.", 502, payload);
}

function toPaginatedMaintenanceCatalog(
  payload: unknown,
  params: MaintenanceCatalogListParams
): PaginatedResult<MaintenanceCatalogEntry> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) => {
      const raw = row as RemoteMaintenance;
      return {
        id: String(pickField(raw, "id") ?? ""),
        title: String(pickField(raw, "title") ?? ""),
      };
    });
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
      data: rows.map((row) => {
        const raw = row as RemoteMaintenance;
        return {
          id: String(pickField(raw, "id") ?? ""),
          title: String(pickField(raw, "title") ?? ""),
        };
      }),
      page: Number(page.page ?? params.page ?? 1),
      pageSize: Number(page.pageSize ?? params.pageSize ?? rows.length),
      total: Number(page.total ?? rows.length),
      totalPages: Number(page.totalPages ?? 1),
    };
  }

  throw new ApiError("Work catalog response was malformed.", 502, payload);
}

function resolvePreviousStatus(
  raw: { _previousStatus?: string; status?: string },
  statusInUpdate: boolean
): string {
  if (raw._previousStatus != null && String(raw._previousStatus).trim()) {
    return String(raw._previousStatus);
  }
  if (!statusInUpdate) {
    return String(raw.status ?? "requested");
  }
  throw new Error("Work update did not return _previousStatus.");
}

/**
 * Work domain service (compatibility name: Maintenance).
 *
 * Browser-safe. Always goes through /api/maintenance → fm_work.
 * Never imports server-only session/admin clients.
 * Never Apps Script after Phase 2B.
 *
 * Server Action / orchestration callers that need direct persistence must use
 * `@/modules/maintenance/server/MaintenanceServerAccess` instead.
 */
export const MaintenanceService = {
  /** Map a Work/API row (shared by createTreatment orchestration). */
  fromAppsScriptRow(raw: unknown): Maintenance {
    return mapRemoteMaintenance(raw as RemoteMaintenance);
  },

  async listMaintenance(
    params: MaintenanceListParams = {},
    options?: { signal?: AbortSignal }
  ): Promise<PaginatedResult<Maintenance>> {
    const key = stableRequestKey(CacheNamespaces.maintenanceList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      status: params.status ?? "all",
      priority: params.priority ?? "all",
      type: params.type ?? "all",
      facilityId: params.facilityId ?? "all",
      assignedToUserId: params.assignedToUserId ?? "all",
      requiresWorkOrder: params.requiresWorkOrder ?? "all",
      sort: params.sort ?? "",
      includeCriticalWorkTotal: !!params.includeCriticalWorkTotal,
      includeOperationalPictureTotals: !!params.includeOperationalPictureTotals,
      asOf: params.asOf ?? "",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>(
        "/maintenance",
        {
          resource: "maintenance",
          action: "getAll",
          payload: params,
        },
        { signal: options?.signal }
      );
      return toPaginatedMaintenance(response.data, params);
    });
  },

  async listMaintenanceCatalog(
    params: MaintenanceCatalogListParams = {}
  ): Promise<PaginatedResult<MaintenanceCatalogEntry>> {
    const all = await sharedRequest(
      `${CacheNamespaces.maintenanceCatalog}:all`,
      async () => {
        const response = await apiClient.post<unknown>("/maintenance", {
          resource: "maintenance",
          action: "listCatalog",
          payload: { page: 1, pageSize: 500 },
        });
        return toPaginatedMaintenanceCatalog(response.data, {
          page: 1,
          pageSize: 500,
        }).data;
      },
      { ttlMs: CATALOG_TTL_MS }
    );

    const search = (params.search ?? "").trim().toLowerCase();
    const filtered = search
      ? all.filter(
          (row) =>
            row.id.toLowerCase().includes(search) ||
            row.title.toLowerCase().includes(search)
        )
      : all;
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.max(
      1,
      params.pageSize ?? (filtered.length || 50)
    );
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const start = (page - 1) * pageSize;
    return {
      data: filtered.slice(start, start + pageSize),
      page,
      pageSize,
      total,
      totalPages,
    };
  },

  async fetchMaintenanceCatalog(): Promise<MaintenanceCatalogEntry[]> {
    const page = await MaintenanceService.listMaintenanceCatalog({
      page: 1,
      pageSize: 500,
    });
    return page.data;
  },

  async getMaintenance(id: string): Promise<Maintenance | null> {
    try {
      const response = await apiClient.post<Maintenance>("/maintenance", {
        resource: "maintenance",
        action: "getById",
        payload: { id },
      });
      return mapRemoteMaintenance(response.data as unknown as RemoteMaintenance);
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

  async createMaintenance(input: CreateMaintenanceInput): Promise<Maintenance> {
    const payload = applyWorkOrderRule(input);
    const response = await apiClient.post<Maintenance>("/maintenance", {
      resource: "maintenance",
      action: "create",
      payload,
    });
    const created = mapRemoteMaintenance(
      response.data as unknown as RemoteMaintenance
    );
    onMaintenanceMutation();
    return created;
  },

  async updateMaintenance(
    id: string,
    input: UpdateMaintenanceInput
  ): Promise<Maintenance> {
    const { entity } = await MaintenanceService.updateMaintenanceWithMeta(
      id,
      input
    );
    return entity;
  },

  async updateMaintenanceWithMeta(
    id: string,
    input: UpdateMaintenanceInput
  ): Promise<{ entity: Maintenance; previousStatus: string }> {
    const statusInUpdate = input.status !== undefined && input.status !== null;

    const payload = applyWorkOrderRule({
      ...input,
      id,
      _returnPreviousStatus: true,
    } as UpdateMaintenanceInput & {
      id: string;
      _returnPreviousStatus: boolean;
    });

    const response = await apiClient.post<
      Maintenance & { _previousStatus?: string }
    >("/maintenance", {
      resource: "maintenance",
      action: "update",
      payload,
    });
    const raw = response.data as Maintenance & { _previousStatus?: string };
    const previousStatus = resolvePreviousStatus(raw, statusInUpdate);
    const updated = mapRemoteMaintenance(raw as unknown as RemoteMaintenance);
    onMaintenanceMutation();
    return { entity: updated, previousStatus };
  },

  /** Soft-cancel — work rows are never deleted. */
  async deactivateMaintenance(id: string): Promise<Maintenance> {
    const response = await apiClient.post<Maintenance>("/maintenance", {
      resource: "maintenance",
      action: "deactivate",
      payload: { id },
    });
    const deactivated = mapRemoteMaintenance(
      response.data as unknown as RemoteMaintenance
    );
    onMaintenanceMutation();
    return deactivated;
  },
};

export type IMaintenanceService = typeof MaintenanceService;
