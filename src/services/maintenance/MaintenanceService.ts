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
  const title =
    optionalMappedString(raw, "title", "Title", "Maintenance Title") ||
    description ||
    "";

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

  const workOrderId = optionalMappedString(
    raw,
    "workOrderId",
    "Work Order ID"
  );
  let requiresWorkOrder = optionalBoolean(
    raw,
    "requiresWorkOrder",
    "Requires Work Order"
  );
  if (requiresWorkOrder == null) {
    requiresWorkOrder = Boolean(workOrderId);
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
    eventId: optionalMappedString(raw, "eventId", "Event ID", "Event Id"),
    incidentId: optionalMappedString(raw, "incidentId", "Incident ID"),
    workOrderId,
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
    const response = await apiClient.post<unknown>("/maintenance", {
      resource: "maintenance",
      action: "getAll",
      payload: params,
    });
    return toPaginatedMaintenance(response.data, params);
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
    return mapRemoteMaintenance(response.data as unknown as RemoteMaintenance);
  },

  async updateMaintenance(
    id: string,
    input: UpdateMaintenanceInput
  ): Promise<Maintenance> {
    const payload = applyWorkOrderRule({ ...input, id });
    const response = await apiClient.post<Maintenance>("/maintenance", {
      resource: "maintenance",
      action: "update",
      payload,
    });
    return mapRemoteMaintenance(response.data as unknown as RemoteMaintenance);
  },

  /** Soft-cancel — maintenance rows are never deleted. */
  async deactivateMaintenance(id: string): Promise<Maintenance> {
    const response = await apiClient.post<Maintenance>("/maintenance", {
      resource: "maintenance",
      action: "deactivate",
      payload: { id },
    });
    return mapRemoteMaintenance(response.data as unknown as RemoteMaintenance);
  },
};

export type IMaintenanceService = typeof MaintenanceService;
