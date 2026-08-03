import type { PaginatedResult } from "@/types";
import type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderListParams,
  WorkOrderMaintenanceType,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
} from "@/modules/work-orders/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
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
    title: String(pickField(raw, "title", "Title") ?? ""),
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
      "Reported By User ID"
    ),
    incidentId: optionalMappedString(raw, "incidentId", "Incident ID"),
    parentWorkOrderId: optionalMappedString(
      raw,
      "parentWorkOrderId",
      "Parent Work Order ID"
    ),
    assignedToUserId: optionalMappedString(
      raw,
      "assignedToUserId",
      "Assigned To User ID"
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
    const response = await apiClient.post<unknown>("/work-orders", {
      resource: "work-orders",
      action: "getAll",
      payload: params,
    });

    return toPaginatedWorkOrders(response.data, params);
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
    return mapRemoteWorkOrder(response.data as unknown as RemoteWorkOrder);
  },

  async updateWorkOrder(
    id: string,
    input: UpdateWorkOrderInput
  ): Promise<WorkOrder> {
    const response = await apiClient.post<WorkOrder>("/work-orders", {
      resource: "work-orders",
      action: "update",
      payload: { id, ...input },
    });
    return mapRemoteWorkOrder(response.data as unknown as RemoteWorkOrder);
  },

  /** Soft-cancel — work orders are never deleted. Maps to status=cancelled. */
  async deactivateWorkOrder(id: string): Promise<WorkOrder> {
    const response = await apiClient.post<WorkOrder>("/work-orders", {
      resource: "work-orders",
      action: "deactivate",
      payload: { id },
    });
    return mapRemoteWorkOrder(response.data as unknown as RemoteWorkOrder);
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
