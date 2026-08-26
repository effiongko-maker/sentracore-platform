import { parseIdList, primaryId } from "@/lib/operational/idLists";
import type { PaginatedResult } from "@/types";
import type {
  CreateIncidentInput,
  Incident,
  IncidentChannel,
  IncidentListParams,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  IncidentType,
  UpdateIncidentInput,
} from "@/modules/incidents/types";
import { applyWorkOrderRule } from "@/modules/incidents/utils";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onIncidentMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";
import {
  postToAppsScript,
  postToAppsScriptData,
} from "@/services/api/appsScriptProxy";

type RemoteIncident = Record<string, unknown>;

function pickField(raw: RemoteIncident, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function optionalMappedString(
  raw: RemoteIncident,
  ...keys: string[]
): string | undefined {
  const value = pickField(raw, ...keys);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function optionalNumber(
  raw: RemoteIncident,
  ...keys: string[]
): number | undefined {
  const value = pickField(raw, ...keys);
  if (value == null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function optionalBoolean(
  raw: RemoteIncident,
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

function mapStatus(raw: string): IncidentStatus {
  const value = normalizeEnum(raw);
  if (value === "open") return "reported";
  return (value || "reported") as IncidentStatus;
}

function coalesceIdList(...sources: unknown[]): string[] {
  for (const source of sources) {
    const parsed = parseIdList(source);
    if (parsed.length > 0) return parsed;
  }
  return [];
}

function readOperationalEventId(raw: RemoteIncident): string | undefined {
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

function mapRemoteIncident(raw: RemoteIncident): Incident {
  const type = normalizeEnum(
    String(pickField(raw, "type", "Type", "Incident Type") ?? "other")
  ) as IncidentType;
  const source = normalizeEnum(
    String(pickField(raw, "source", "Source") ?? "manual")
  ) as IncidentSource;
  const severity = normalizeEnum(
    String(pickField(raw, "severity", "Severity") ?? "medium")
  ) as IncidentSeverity;
  const status = mapStatus(
    String(pickField(raw, "status", "Status") ?? "reported")
  );
  const channelRaw = optionalMappedString(
    raw,
    "reportedVia",
    "Reported Via",
    "Channel"
  );
  const reportedVia = channelRaw
    ? (normalizeEnum(channelRaw) as IncidentChannel)
    : undefined;

  const title =
    optionalMappedString(raw, "title", "Title", "Incident Title") ||
    optionalMappedString(raw, "description", "Description") ||
    "";

  const reportedAt = String(
    pickField(
      raw,
      "reportedAt",
      "Reported At",
      "Date Reported",
      "Date Opened"
    ) ?? new Date().toISOString()
  );

  const workOrderIds = coalesceIdList(
    pickField(raw, "workOrderIds"),
    pickField(raw, "Work Order IDs"),
    pickField(raw, "workOrderId", "Work Order ID")
  );
  const maintenanceIds = coalesceIdList(
    pickField(raw, "maintenanceIds"),
    pickField(raw, "Maintenance IDs")
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
    id: String(
      pickField(raw, "id", "Incident ID", "Event ID", "Event Id") ?? ""
    ),
    title,
    description: optionalMappedString(raw, "description", "Description"),
    type: type || "other",
    source: source || "manual",
    categoryId: optionalMappedString(raw, "categoryId", "Category ID"),
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    assetId: optionalMappedString(raw, "assetId", "Asset ID"),
    locationDetail: optionalMappedString(
      raw,
      "locationDetail",
      "Location",
      "Location Detail"
    ),
    reportedByUserId: optionalMappedString(
      raw,
      "reportedByUserId",
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
    workOrderId,
    workOrderIds,
    maintenanceIds,
    parentIncidentId: optionalMappedString(
      raw,
      "parentIncidentId",
      "Parent Incident ID"
    ),
    operationalEventId: readOperationalEventId(raw),
    reportedAt,
    discoveredAt: optionalMappedString(
      raw,
      "discoveredAt",
      "Discovered At",
      "Date Discovered"
    ),
    reportedVia,
    severity: severity || "medium",
    peopleAffected: optionalNumber(raw, "peopleAffected", "People Affected"),
    isEmergency: optionalBoolean(raw, "isEmergency", "Is Emergency", "Emergency"),
    status,
    holdReason: optionalMappedString(raw, "holdReason", "Hold Reason"),
    requiresWorkOrder,
    acknowledgedAt: optionalMappedString(
      raw,
      "acknowledgedAt",
      "Acknowledged At"
    ),
    responseDueAt: optionalMappedString(
      raw,
      "responseDueAt",
      "Response Due At"
    ),
    containedAt: optionalMappedString(raw, "containedAt", "Contained At"),
    resolvedAt: optionalMappedString(
      raw,
      "resolvedAt",
      "Resolved At",
      "Date Resolved"
    ),
    closedAt: optionalMappedString(
      raw,
      "closedAt",
      "Closed At",
      "Date Closed"
    ),
    immediateActions: optionalMappedString(
      raw,
      "immediateActions",
      "Immediate Actions"
    ),
    rootCause: optionalMappedString(raw, "rootCause", "Root Cause"),
    correctiveActions: optionalMappedString(
      raw,
      "correctiveActions",
      "Corrective Actions"
    ),
    preventiveActions: optionalMappedString(
      raw,
      "preventiveActions",
      "Preventive Actions"
    ),
    resolutionNotes: optionalMappedString(
      raw,
      "resolutionNotes",
      "Resolution Notes"
    ),
    createdAt: String(
      pickField(raw, "createdAt", "Created At") ?? reportedAt
    ),
    updatedAt: String(
      pickField(raw, "updatedAt", "Updated At") ?? reportedAt
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

function toPaginatedIncidents(
  payload: unknown,
  params: IncidentListParams
): PaginatedResult<Incident> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteIncident(row as RemoteIncident)
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
      data: rows.map((row) => mapRemoteIncident(row as RemoteIncident)),
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
 * Incidents domain service.
 * Talks only to ApiClient. Mirrors WorkOrderService.
 */
export const IncidentService = {
  async listIncidents(
    params: IncidentListParams = {}
  ): Promise<PaginatedResult<Incident>> {
    const key = stableRequestKey(CacheNamespaces.incidentsList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      status: params.status ?? "all",
      severity: params.severity ?? "all",
      facilityId: params.facilityId ?? "all",
      assignedToUserId: params.assignedToUserId ?? "all",
      requiresWorkOrder: params.requiresWorkOrder ?? "all",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>("/incidents", {
        resource: "incidents",
        action: "getAll",
        payload: params,
      });
      return toPaginatedIncidents(response.data, params);
    });
  },

  async getIncident(id: string): Promise<Incident | null> {
    try {
      if (typeof window === "undefined") {
        const row = await postToAppsScriptData(
          {
            resource: "incidents",
            action: "getById",
            payload: { id },
          },
          { resource: "incidents", action: "getById" },
          "IncidentService.getIncident"
        );
        return mapRemoteIncident(row as RemoteIncident);
      }

      const response = await apiClient.post<Incident>("/incidents", {
        resource: "incidents",
        action: "getById",
        payload: { id },
      });
      return mapRemoteIncident(response.data as unknown as RemoteIncident);
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

  async createIncident(input: CreateIncidentInput): Promise<Incident> {
    const payload = applyWorkOrderRule(input);

    // Server Actions / Action Engine: write directly via Apps Script (same path as API route).
    // Browser: keep using /api/incidents proxy.
    if (typeof window === "undefined") {
      const raw = await postToAppsScript(
        {
          resource: "incidents",
          action: "create",
          payload,
        },
        { resource: "incidents", action: "create" },
        "IncidentService.createIncident"
      );

      const envelope = raw as { data?: unknown; success?: boolean; message?: string };
      if (envelope && typeof envelope === "object" && envelope.success === false) {
        throw new ApiError(
          envelope.message ?? "Failed to create incident",
          400,
          envelope
        );
      }

      const row =
        envelope && typeof envelope === "object" && "data" in envelope
          ? envelope.data
          : raw;

      const created = mapRemoteIncident(row as RemoteIncident);
      onIncidentMutation();
      return created;
    }

    const response = await apiClient.post<Incident>("/incidents", {
      resource: "incidents",
      action: "create",
      payload,
    });
    const created = mapRemoteIncident(
      response.data as unknown as RemoteIncident
    );
    onIncidentMutation();
    return created;
  },

  async updateIncident(
    id: string,
    input: UpdateIncidentInput
  ): Promise<Incident> {
    const payload = applyWorkOrderRule({ ...input, id });

    if (typeof window === "undefined") {
      const row = await postToAppsScriptData(
        {
          resource: "incidents",
          action: "update",
          payload,
        },
        { resource: "incidents", action: "update" },
        "IncidentService.updateIncident"
      );
      const updated = mapRemoteIncident(row as RemoteIncident);
      onIncidentMutation();
      return updated;
    }

    const response = await apiClient.post<Incident>("/incidents", {
      resource: "incidents",
      action: "update",
      payload,
    });
    const updated = mapRemoteIncident(
      response.data as unknown as RemoteIncident
    );
    onIncidentMutation();
    return updated;
  },

  /** Soft-cancel — incidents are never deleted. */
  async deactivateIncident(id: string): Promise<Incident> {
    const response = await apiClient.post<Incident>("/incidents", {
      resource: "incidents",
      action: "deactivate",
      payload: { id },
    });
    const deactivated = mapRemoteIncident(
      response.data as unknown as RemoteIncident
    );
    onIncidentMutation();
    return deactivated;
  },
};

export type IIncidentService = typeof IncidentService;
