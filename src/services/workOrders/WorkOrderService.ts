import type { PaginatedResult } from "@/types";
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
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onWorkOrderMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";
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
    workOrderUuid: optionalMappedString(raw, "workOrderUuid"),
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
    orderType: (() => {
      const value = optionalMappedString(raw, "orderType", "Order Type");
      if (!value) return undefined;
      const normalized = value.toLowerCase().replace(/\s+/g, "_");
      if (normalized === "work_order" || normalized === "job_order") {
        return normalized as WorkOrder["orderType"];
      }
      return undefined;
    })(),
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
      ...(page.operationalPictureWorkOrders !== undefined
        ? { operationalPictureWorkOrders: page.operationalPictureWorkOrders }
        : {}),
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
 * Browser Work Instruction (Work Order / Job Order) client:
 * browser → /api/work-orders → Supabase (fm_work_instructions).
 * This module must stay free of server modules. Server orchestration uses
 * `@/modules/work-orders/server/WorkInstructionServerAccess`.
 */
export const WorkOrderService = {
  async listWorkOrders(
    params: WorkOrderListParams = {},
    options?: { signal?: AbortSignal }
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
      includeOperationalPictureTotals: !!params.includeOperationalPictureTotals,
      asOf: params.asOf ?? "",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>(
        "/work-orders",
        { resource: "work-orders", action: "getAll", payload: params },
        { signal: options?.signal }
      );
      return toPaginatedWorkOrders(response.data, params);
    });
  },

  /**
   * Filter dropdown catalogs, composed from the authoritative registers
   * (Facilities, People and Assets are Supabase).
   * A failing catalog is an error, never an empty dropdown.
   */
  async getFilterCatalog(): Promise<WorkOrderFilterCatalog> {
    const [{ FacilityService }, { AssignablePeopleService }, { AssetService }, { loadAllPages }] =
      await Promise.all([
        import("@/services/facilities/FacilityService"),
        import("@/services/assignablePeople/AssignablePeopleService"),
        import("@/services/assets/AssetService"),
        import("@/services/reporting/loadAllPages"),
      ]);
    // Independent catalogs: one failure never erases the others, and a failed
    // catalog is reported in `failed` — never substituted with a healthy empty list.
    const [facilities, users, assets] = await Promise.allSettled([
      loadAllPages((page, pageSize) => FacilityService.listFacilities({ page, pageSize })),
      AssignablePeopleService.list(),
      loadAllPages((page, pageSize) => AssetService.listAssetsCatalog({ page, pageSize })),
    ]);
    const failed: Array<"facilities" | "users" | "assets"> = [];
    if (facilities.status === "rejected") failed.push("facilities");
    if (users.status === "rejected") failed.push("users");
    if (assets.status === "rejected") failed.push("assets");
    return {
      facilities:
        facilities.status === "fulfilled"
          ? facilities.value.map((f) => ({ id: f.id, name: f.name }))
          : [],
      users:
        users.status === "fulfilled"
          ? users.value.map((u) => ({ id: u.id, name: u.name }))
          : [],
      assets:
        assets.status === "fulfilled"
          ? assets.value.map((a) => ({ id: a.id, name: a.name, facilityId: a.facilityId }))
          : [],
      failed,
    };
  },

  async getWorkOrder(id: string): Promise<WorkOrder | null> {
    try {
      const response = await apiClient.post<WorkOrder>("/work-orders", {
        resource: "work-orders",
        action: "getById",
        payload: { id },
      });
      return mapRemoteWorkOrder(response.data as unknown as RemoteWorkOrder);
    } catch (error) {
      // A missing Work Instruction is a normal outcome; failures and 403s are not.
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createWorkOrder(input: CreateWorkOrderInput): Promise<WorkOrder> {
    const response = await apiClient.post<WorkOrder>("/work-orders", {
      resource: "work-orders",
      action: "create",
      payload: input,
    });
    const created = mapRemoteWorkOrder(response.data as unknown as RemoteWorkOrder);
    onWorkOrderMutation();
    return created;
  },

  async updateWorkOrder(id: string, input: UpdateWorkOrderInput): Promise<WorkOrder> {
    const response = await apiClient.post<WorkOrder>("/work-orders", {
      resource: "work-orders",
      action: "update",
      payload: { id, ...input },
    });
    const updated = mapRemoteWorkOrder(response.data as unknown as RemoteWorkOrder);
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
