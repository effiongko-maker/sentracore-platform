import { parseIdList, primaryId } from "@/lib/operational/idLists";
import type { PaginatedResult } from "@/types";
import type { Maintenance } from "@/modules/maintenance/types";
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderFilterCatalog,
  WorkOrderListParams,
  WorkOrderMaintenanceType,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
} from "@/modules/work-orders/types";
import { MaintenanceService } from "@/services/maintenance/MaintenanceService";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onMaintenanceMutation,
  onWorkOrderMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";
import {
  postToAppsScript,
  postToAppsScriptData,
} from "@/services/api/appsScriptProxy";
type RemoteWorkOrder = Record<string, unknown>;

function pickField(raw: RemoteWorkOrder, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function optionalMappedString(
  raw: RemoteWorkOrder,
  ...keys: string[]
): string | undefined {
  const value = pickField(raw, ...keys);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function optionalNumber(
  raw: RemoteWorkOrder,
  ...keys: string[]
): number | undefined {
  const value = pickField(raw, ...keys);
  if (value == null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function optionalBoolean(
  raw: RemoteWorkOrder,
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

function readWorkOrderIncidentId(raw: RemoteWorkOrder): string | undefined {
  const explicit = optionalMappedString(raw, "incidentId", "Incident ID");
  if (explicit) return explicit;
  const legacy = optionalMappedString(raw, "eventId", "Event ID");
  if (legacy && /^INC-/i.test(legacy)) return legacy;
  return undefined;
}

function readWorkOrderMaintenanceId(raw: RemoteWorkOrder): string | undefined {
  const rawMaint = optionalMappedString(raw, "maintenanceId", "Maintenance ID");
  if (!rawMaint) return undefined;
  if (/^MNT-/i.test(rawMaint)) return rawMaint;
  const hasParentCol = pickField(raw, "parentWorkOrderId", "Parent Work Order ID");
  if (hasParentCol != null && String(hasParentCol).trim() !== "") {
    return /^MNT-/i.test(rawMaint) ? rawMaint : undefined;
  }
  return /^WO-/i.test(rawMaint) ? undefined : rawMaint;
}

function readParentWorkOrderId(raw: RemoteWorkOrder): string | undefined {
  const explicit = optionalMappedString(
    raw,
    "parentWorkOrderId",
    "Parent Work Order ID"
  );
  if (explicit) return explicit;
  const legacy = optionalMappedString(raw, "maintenanceId", "Maintenance ID");
  if (legacy && /^WO-/i.test(legacy)) return legacy;
  return undefined;
}

function readOperationalEventId(raw: RemoteWorkOrder): string | undefined {
  const value = optionalMappedString(
    raw,
    "operationalEventId",
    "Event ID",
    "Event Id"
  );
  if (!value) return undefined;
  if (/^INC-/i.test(value)) return undefined;
  return value;
}

function mapRemoteWorkOrder(raw: RemoteWorkOrder): WorkOrder {
  const type = String(pickField(raw, "type", "Type") ?? "corrective")
    .toLowerCase()
    .replace(/\s+/g, "_") as WorkOrderType;
  const status = String(pickField(raw, "status", "Status") ?? "open")
    .toLowerCase()
    .replace(/\s+/g, "_") as WorkOrderStatus;
  const priority = String(pickField(raw, "priority", "Priority") ?? "medium")
    .toLowerCase()
    .replace(/\s+/g, "_") as WorkOrderPriority;
  const source = String(pickField(raw, "source", "Source") ?? "manual")
    .toLowerCase()
    .replace(/\s+/g, "_") as WorkOrderSource;
  const maintenanceRaw = pickField(
    raw,
    "maintenanceType",
    "Maintenance Type"
  );
  const maintenanceType = maintenanceRaw
    ? (String(maintenanceRaw).toLowerCase().replace(/\s+/g, "_") as WorkOrderMaintenanceType)
    : undefined;

  return {
    id: String(pickField(raw, "id", "Work Order ID") ?? ""),
    title: (() => {
      const explicit = optionalMappedString(raw, "title", "Title");
      const description = optionalMappedString(
        raw,
        "description",
        "Description"
      );
      if (explicit && !/(?:^|\n|\s)(?:Location|Department|Category|Source maintenance)\s*:/i.test(explicit)) {
        return explicit;
      }
      // Title missing or polluted with description context — take the core issue only.
      const source = explicit || description || "";
      if (!source) return "";
      const cut = source.search(
        /\s*(?:\n\n+|(?:Location|Department|Category|Source maintenance)\s*:)/i
      );
      if (cut > 0) return source.slice(0, cut).trim();
      const firstLine = source.split(/\n+/)[0]?.trim() ?? "";
      return firstLine;
    })(),
    description: optionalMappedString(raw, "description", "Description"),
    type,
    maintenanceType,
    source,
    categoryId: optionalMappedString(raw, "categoryId", "Category ID"),
    workInstructions: optionalMappedString(
      raw,
      "workInstructions",
      "Work Instructions"
    ),
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    assetId: optionalMappedString(raw, "assetId", "Asset ID"),
    reportedByUserId: optionalMappedString(
      raw,
      "reportedByUserId",
      "Reported By",
      "Reported By User ID"
    ),
    incidentId: readWorkOrderIncidentId(raw),
    maintenanceId: readWorkOrderMaintenanceId(raw),
    parentWorkOrderId: readParentWorkOrderId(raw),
    operationalEventId: readOperationalEventId(raw),
    assignedToUserId: optionalMappedString(
      raw,
      "assignedToUserId",
      "Assigned To User ID",
      // Apps Script persists assignee on "Assigned To" (ID, not display name).
      "Assigned To"
    ),
    assignedGroupId: optionalMappedString(
      raw,
      "assignedGroupId",
      "Assigned Group ID"
    ),
    requestedAt: optionalMappedString(raw, "requestedAt", "Requested At"),
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
    dueAt: optionalMappedString(raw, "dueAt", "Due At", "Due Date"),
    status,
    priority,
    holdReason: optionalMappedString(raw, "holdReason", "Hold Reason"),
    startedAt: optionalMappedString(raw, "startedAt", "Started At"),
    completedAt: optionalMappedString(raw, "completedAt", "Completed At"),
    estimatedHours: optionalNumber(raw, "estimatedHours", "Estimated Hours"),
    actualHours: optionalNumber(raw, "actualHours", "Actual Hours"),
    estimatedCost: optionalNumber(raw, "estimatedCost", "Estimated Cost"),
    actualCost: optionalNumber(raw, "actualCost", "Actual Cost"),
    completionNotes: optionalMappedString(
      raw,
      "completionNotes",
      "Completion Notes"
    ),
    workPerformed: optionalMappedString(raw, "workPerformed", "Work Performed"),
    downtimeMinutes: optionalNumber(raw, "downtimeMinutes", "Downtime Minutes"),
    slaDueAt: optionalMappedString(raw, "slaDueAt", "SLA Due At"),
    requiresApproval: optionalBoolean(
      raw,
      "requiresApproval",
      "Requires Approval"
    ),
    approvalId: optionalMappedString(raw, "approvalId", "Approval ID"),
    createdAt: String(
      pickField(raw, "createdAt", "Created At") ?? new Date().toISOString()
    ),
    updatedAt: String(
      pickField(raw, "updatedAt", "Updated At") ?? new Date().toISOString()
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
  };
}

function toPaginatedWorkOrders(
  payload: unknown,
  params: WorkOrderListParams
): PaginatedResult<WorkOrder> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteWorkOrder(row as RemoteWorkOrder)
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
      data: rows.map((row) => mapRemoteWorkOrder(row as RemoteWorkOrder)),
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
 * Work Orders domain service.
 * Talks only to ApiClient. Mirrors FacilityService / AssetService.
 */
export const WorkOrderService = {
  async listWorkOrders(
    params: WorkOrderListParams = {}
  ): Promise<PaginatedResult<WorkOrder>> {
    const key = stableRequestKey(CacheNamespaces.workOrdersList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      status: params.status ?? "all",
      priority: params.priority ?? "all",
      facilityId: params.facilityId ?? "all",
      assetId: params.assetId ?? "all",
      assignedToUserId: params.assignedToUserId ?? "all",
      maintenanceId: params.maintenanceId ?? "all",
      sort: params.sort ?? "",
      dueDate: params.dueDate ?? "",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>("/work-orders", {
        resource: "work-orders",
        action: "getAll",
        payload: params,
      });
      return toPaginatedWorkOrders(response.data, params);
    });
  },

  /** Consolidated WO filter catalogs — one Apps Script invocation. */
  async getFilterCatalog(): Promise<WorkOrderFilterCatalog> {
    const response = await apiClient.post<unknown>("/work-orders", {
      resource: "work-orders",
      action: "getFilterCatalog",
      payload: { _auditTiming: true },
    });
    const raw = response.data;
    if (!raw || typeof raw !== "object") {
      return { facilities: [], users: [], assets: [] };
    }
    const data = raw as Record<string, unknown>;
    const mapRow = (row: unknown, fields: string[]) => {
      if (!row || typeof row !== "object") return null;
      const obj = row as Record<string, unknown>;
      const out: Record<string, string> = {};
      for (const field of fields) {
        out[field] = String(obj[field] ?? "").trim();
      }
      return out;
    };
    const facilities = Array.isArray(data.facilities)
      ? data.facilities
          .map((row) => mapRow(row, ["id", "name"]))
          .filter((row): row is { id: string; name: string } => !!row?.id)
      : [];
    const users = Array.isArray(data.users)
      ? data.users
          .map((row) => mapRow(row, ["id", "name"]))
          .filter((row): row is { id: string; name: string } => !!row?.id)
      : [];
    const assets = Array.isArray(data.assets)
      ? data.assets
          .map((row) => mapRow(row, ["id", "name", "facility"]))
          .filter(
            (row): row is { id: string; name: string; facility: string } =>
              !!row?.id
          )
      : [];
    const cacheDiagnostics = data._cacheDiagnostics;
    return {
      facilities,
      users,
      assets,
      cacheDiagnostics:
        cacheDiagnostics && typeof cacheDiagnostics === "object"
          ? (cacheDiagnostics as WorkOrderFilterCatalog["cacheDiagnostics"])
          : undefined,
    };
  },

  async getWorkOrder(id: string): Promise<WorkOrder | null> {
    try {
      if (typeof window === "undefined") {
        const row = await postToAppsScriptData(
          {
            resource: "work-orders",
            action: "getById",
            payload: { id },
          },
          { resource: "work-orders", action: "getById" },
          "WorkOrderService.getWorkOrder"
        );
        return mapRemoteWorkOrder(row as RemoteWorkOrder);
      }

      const response = await apiClient.post<WorkOrder>("/work-orders", {
        resource: "work-orders",
        action: "getById",
        payload: { id },
      });
      return mapRemoteWorkOrder(response.data as unknown as RemoteWorkOrder);
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

  async createWorkOrder(input: CreateWorkOrderInput): Promise<WorkOrder> {
    if (typeof window === "undefined") {
      const raw = await postToAppsScript(
        {
          resource: "work-orders",
          action: "create",
          payload: input,
        },
        { resource: "work-orders", action: "create" },
        "WorkOrderService.createWorkOrder"
      );

      const envelope = raw as {
        data?: unknown;
        success?: boolean;
        message?: string;
      };
      if (envelope && typeof envelope === "object" && envelope.success === false) {
        throw new ApiError(
          envelope.message ?? "Failed to create work order",
          400,
          envelope
        );
      }

      const row =
        envelope && typeof envelope === "object" && "data" in envelope
          ? envelope.data
          : raw;

      const created = mapRemoteWorkOrder(row as RemoteWorkOrder);
      onWorkOrderMutation();
      return created;
    }

    const response = await apiClient.post<WorkOrder>("/work-orders", {
      resource: "work-orders",
      action: "create",
      payload: input,
    });
    const created = mapRemoteWorkOrder(
      response.data as unknown as RemoteWorkOrder
    );
    onWorkOrderMutation();
    return created;
  },

  async updateWorkOrder(
    id: string,
    input: UpdateWorkOrderInput
  ): Promise<WorkOrder> {
    if (typeof window === "undefined") {
      const row = await postToAppsScriptData(
        {
          resource: "work-orders",
          action: "update",
          payload: { id, ...input },
        },
        { resource: "work-orders", action: "update" },
        "WorkOrderService.updateWorkOrder"
      );
      const updated = mapRemoteWorkOrder(row as RemoteWorkOrder);
      onWorkOrderMutation();
      return updated;
    }

    const response = await apiClient.post<WorkOrder>("/work-orders", {
      resource: "work-orders",
      action: "update",
      payload: { id, ...input },
    });
    const updated = mapRemoteWorkOrder(
      response.data as unknown as RemoteWorkOrder
    );
    onWorkOrderMutation();
    return updated;
  },

  /** Soft-cancel — work orders are never deleted. Maps to status=cancelled. */
  async deactivateWorkOrder(id: string): Promise<WorkOrder> {
    const response = await apiClient.post<WorkOrder>("/work-orders", {
      resource: "work-orders",
      action: "deactivate",
      payload: { id },
    });
    const deactivated = mapRemoteWorkOrder(
      response.data as unknown as RemoteWorkOrder
    );
    onWorkOrderMutation();
    return deactivated;
  },

  /**
   * Consolidated Create-from-Maintenance mutation (1 Apps Script invocation).
   * Server-only — auth/lease/events stay in Next.js orchestration.
   */
  async createWorkOrderFromMaintenance(input: {
    maintenanceId: string;
    title?: string;
    requestedAt?: string;
    createdByUserId?: string;
    updatedByUserId?: string;
    actorUserId?: string;
  }): Promise<{
    maintenance: Maintenance;
    workOrder: WorkOrder;
    created: boolean;
    timings?: Record<string, unknown>;
    buildMarker?: string;
  }> {
    if (typeof window !== "undefined") {
      throw new ApiError(
        "createWorkOrderFromMaintenance is server-only.",
        403
      );
    }

    const row = await postToAppsScriptData(
      {
        resource: "work-orders",
        action: "createFromMaintenance",
        payload: {
          maintenanceId: input.maintenanceId,
          title: input.title,
          requestedAt: input.requestedAt,
          createdByUserId: input.createdByUserId,
          updatedByUserId: input.updatedByUserId,
          actorUserId: input.actorUserId,
        },
      },
      { resource: "work-orders", action: "createFromMaintenance" },
      "WorkOrderService.createWorkOrderFromMaintenance"
    );

    if (!row || typeof row !== "object") {
      throw new ApiError(
        "createWorkOrderFromMaintenance returned empty data",
        500,
        row
      );
    }

    const data = row as Record<string, unknown>;
    if (!data.maintenance || typeof data.maintenance !== "object") {
      throw new ApiError(
        "createWorkOrderFromMaintenance missing maintenance",
        500,
        row
      );
    }
    if (!data.workOrder || typeof data.workOrder !== "object") {
      throw new ApiError(
        "createWorkOrderFromMaintenance missing workOrder",
        500,
        row
      );
    }

    const result = {
      maintenance: MaintenanceService.fromAppsScriptRow(data.maintenance),
      workOrder: mapRemoteWorkOrder(data.workOrder as RemoteWorkOrder),
      created: data.created === true,
      timings:
        data.timings && typeof data.timings === "object"
          ? (data.timings as Record<string, unknown>)
          : undefined,
      buildMarker:
        data.buildMarker != null ? String(data.buildMarker) : undefined,
    };

    onWorkOrderMutation();
    onMaintenanceMutation();
    return result;
  },

  async getOpenWorkOrders(): Promise<WorkOrder[]> {
    const open = await WorkOrderService.listWorkOrders({
      page: 1,
      pageSize: 50,
      status: "open",
    });
    const inProgress = await WorkOrderService.listWorkOrders({
      page: 1,
      pageSize: 50,
      status: "in_progress",
    });
    return [...open.data, ...inProgress.data];
  },
};

export type IWorkOrderService = typeof WorkOrderService;
