import { parseIdList, primaryId } from "@/lib/operational/idLists";
import type { PaginatedResult } from "@/types";
import type {
  CreateMaintenanceInput,
  Maintenance,
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
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";
import {
  postToAppsScript,
  postToAppsScriptData,
} from "@/services/api/appsScriptProxy";

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

function coalesceIdList(...sources: unknown[]): string[] {
  for (const source of sources) {
    const parsed = parseIdList(source);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function readOperationalEventId(raw: RemoteMaintenance): string | undefined {
  const legacy = optionalMappedString(raw, "eventId", "Event ID", "Event Id");
  const explicit = optionalMappedString(raw, "operationalEventId");
  const value = explicit ?? legacy;
  if (!value) return undefined;
  if (/^MNT-/i.test(value) || /^INC-/i.test(value)) return undefined;
  return value;
}

function mapRemoteMaintenance(raw: RemoteMaintenance): Maintenance {
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
  const explicitTitle = optionalMappedString(
    raw,
    "title",
    "Title",
    "Maintenance Title"
  );
  // Never promote the full description blob (Location/Category/Requester notes)
  // into title when the Title column is empty — take the first free-text line.
  const title =
    explicitTitle ||
    (() => {
      if (!description) return "";
      const firstBlock = description
        .split(/\n\n+/)
        .map((block) => block.trim())
        .find(
          (block) =>
            block &&
            !/^(Location|Category|Attachment|Requested by|Reported by):/i.test(
              block
            )
        );
      if (firstBlock) return firstBlock.split(/\n+/)[0]?.trim() || "";
      return "";
    })();

  const reportedAt = String(
    pickField(
      raw,
      "reportedAt",
      "Reported At",
      "Date Requested",
      "Date Reported"
    ) ?? new Date().toISOString()
  );

  const completedAt = optionalMappedString(
    raw,
    "completedAt",
    "Completed At",
    "Date Completed"
  );

  const workOrderIds = coalesceIdList(
    pickField(raw, "workOrderIds"),
    pickField(raw, "Work Order IDs"),
    pickField(raw, "workOrderId", "Work Order ID")
  );
  const workOrderId = primaryId(workOrderIds);
  let requiresWorkOrder = optionalBoolean(
    raw,
    "requiresWorkOrder",
    "Requires Work Order"
  );
  if (requiresWorkOrder == null) {
    requiresWorkOrder = workOrderIds.length > 0;
  }

  return applyWorkOrderRule({
    id: String(pickField(raw, "id", "Maintenance ID") ?? ""),
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
      "Requester",
      "Reported By",
      "Reported By User ID"
    ),
    assignedToUserId: optionalMappedString(
      raw,
      "assignedToUserId",
      "Assigned To",
      "Assigned To User ID"
    ),
    assignedGroupId: optionalMappedString(
      raw,
      "assignedGroupId",
      "Assigned Group ID"
    ),
    operationalEventId: readOperationalEventId(raw),
    eventId: readOperationalEventId(raw),
    incidentId: optionalMappedString(raw, "incidentId", "Incident ID"),
    workOrderId,
    workOrderIds,
    parentMaintenanceId: optionalMappedString(
      raw,
      "parentMaintenanceId",
      "Parent Maintenance ID"
    ),
    priority: priority || "medium",
    status,
    holdReason: optionalMappedString(raw, "holdReason", "Hold Reason"),
    requiresWorkOrder,
    reportedAt,
    scheduledStartAt: optionalMappedString(
      raw,
      "scheduledStartAt",
      "Scheduled Start At"
    ),
    scheduledEndAt: optionalMappedString(
      raw,
      "scheduledEndAt",
      "Scheduled End At"
    ),
    dueAt: optionalMappedString(raw, "dueAt", "Due At"),
    startedAt: optionalMappedString(raw, "startedAt", "Started At"),
    completedAt,
    completionNotes: optionalMappedString(
      raw,
      "completionNotes",
      "Completion Notes"
    ),
    workPerformed: optionalMappedString(
      raw,
      "workPerformed",
      "Work Performed"
    ),
    createdAt: String(
      pickField(raw, "createdAt", "Created At") ?? reportedAt
    ),
    updatedAt: String(
      pickField(raw, "updatedAt", "Updated At") ?? completedAt ?? reportedAt
    ),
    createdByUserId: optionalMappedString(
      raw,
      "createdByUserId",
      "Created By User ID"
    ),
    updatedByUserId: optionalMappedString(
      raw,
      "updatedByUserId",
      "Updated By User ID"
    ),
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
    return {
      data: rows.map((row) => mapRemoteMaintenance(row as RemoteMaintenance)),
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
 * Maintenance domain service.
 * Talks only to ApiClient. Mirrors IncidentService / WorkOrderService.
 */
export const MaintenanceService = {
  async listMaintenance(
    params: MaintenanceListParams = {}
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
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>("/maintenance", {
        resource: "maintenance",
        action: "getAll",
        payload: params,
      });
      return toPaginatedMaintenance(response.data, params);
    });
  },

  async getMaintenance(id: string): Promise<Maintenance | null> {
    try {
      if (typeof window === "undefined") {
        const row = await postToAppsScriptData(
          {
            resource: "maintenance",
            action: "getById",
            payload: { id },
          },
          { resource: "maintenance", action: "getById" },
          "MaintenanceService.getMaintenance"
        );
        return mapRemoteMaintenance(row as RemoteMaintenance);
      }

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

    // Server Actions / Action Engine: write directly via Apps Script (same path as API route).
    // Browser: keep using /api/maintenance proxy.
    if (typeof window === "undefined") {
      const raw = await postToAppsScript(
        {
          resource: "maintenance",
          action: "create",
          payload,
        },
        { resource: "maintenance", action: "create" },
        "MaintenanceService.createMaintenance"
      );

      const envelope = raw as {
        data?: unknown;
        success?: boolean;
        message?: string;
      };
      if (envelope && typeof envelope === "object" && envelope.success === false) {
        throw new ApiError(
          envelope.message ?? "Failed to create maintenance",
          400,
          envelope
        );
      }

      const row =
        envelope && typeof envelope === "object" && "data" in envelope
          ? envelope.data
          : raw;

      const created = mapRemoteMaintenance(row as RemoteMaintenance);
      onMaintenanceMutation();
      return created;
    }

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
    const payload = applyWorkOrderRule({ ...input, id });

    if (typeof window === "undefined") {
      const row = await postToAppsScriptData(
        {
          resource: "maintenance",
          action: "update",
          payload,
        },
        { resource: "maintenance", action: "update" },
        "MaintenanceService.updateMaintenance"
      );
      const updated = mapRemoteMaintenance(row as RemoteMaintenance);
      onMaintenanceMutation();
      return updated;
    }

    const response = await apiClient.post<Maintenance>("/maintenance", {
      resource: "maintenance",
      action: "update",
      payload,
    });
    const updated = mapRemoteMaintenance(
      response.data as unknown as RemoteMaintenance
    );
    onMaintenanceMutation();
    return updated;
  },

  /** Soft-cancel — maintenance rows are never deleted. */
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
