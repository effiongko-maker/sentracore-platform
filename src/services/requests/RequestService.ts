import { parseIdList } from "@/lib/operational/idLists";
import type { PaginatedResult } from "@/types";
import type {
  CreateRequestInput,
  RequestListParams,
  RequestRecord,
  RequestStatus,
  RequestType,
  UpdateRequestInput,
} from "@/modules/requests/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  CacheNamespaces,
  onRequestMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

/**
 * Browser Request client: browser → /api/requests → Supabase (fm_requests).
 * This module must stay free of server modules. Server orchestration
 * uses `@/modules/requests/server/RequestServerAccess`.
 */

type RemoteRequest = Record<string, unknown>;

function pickField(raw: RemoteRequest, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function optionalMappedString(
  raw: RemoteRequest,
  ...keys: string[]
): string | undefined {
  const value = pickField(raw, ...keys);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function mapStatus(raw: string): RequestStatus {
  const value = raw.toLowerCase().replace(/\s+/g, "_");
  return (value || "submitted") as RequestStatus;
}

function mapRequestType(raw: unknown): RequestType | undefined {
  if (raw == null) return undefined;
  const value = String(raw).toLowerCase().replace(/\s+/g, "_").trim();
  if (value === "maintenance" || value === "incident") return value;
  return undefined;
}

function mapRemoteRequest(raw: RemoteRequest): RequestRecord {
  const createdAt = String(
    pickField(raw, "createdAt", "Created At") ?? new Date().toISOString()
  );
  const incidentIds = parseIdList(
    pickField(raw, "incidentIds", "Incident IDs") ?? []
  );
  const maintenanceIds = parseIdList(
    pickField(raw, "maintenanceIds", "Maintenance IDs") ?? []
  );
  const workOrderIds = parseIdList(
    pickField(raw, "workOrderIds", "Work Order IDs") ?? []
  );

  return {
    id: String(pickField(raw, "id", "Request ID") ?? ""),
    requestUuid: optionalMappedString(raw, "requestUuid"),
    title: String(pickField(raw, "title", "Title") ?? ""),
    description: optionalMappedString(raw, "description", "Description"),
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    occurredAt: String(
      pickField(raw, "occurredAt", "Occurred At") ?? createdAt
    ),
    locationDetail: optionalMappedString(
      raw,
      "locationDetail",
      "Location Detail"
    ),
    reporterName: optionalMappedString(raw, "reporterName", "Reporter Name"),
    reporterContact: optionalMappedString(
      raw,
      "reporterContact",
      "Reporter Contact"
    ),
    reportedByUserId: optionalMappedString(
      raw,
      "reportedByUserId",
      "Reported By User ID"
    ),
    requestType: mapRequestType(
      pickField(raw, "requestType", "Request Type")
    ),
    status: mapStatus(String(pickField(raw, "status", "Status") ?? "submitted")),
    incidentIds,
    maintenanceIds,
    workOrderIds,
    createdAt,
    updatedAt: String(
      pickField(raw, "updatedAt", "Updated At") ?? createdAt
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

function toPaginatedRequests(
  payload: unknown,
  params: RequestListParams
): PaginatedResult<RequestRecord> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) => mapRemoteRequest(row as RemoteRequest));
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
      data: rows.map((row) => mapRemoteRequest(row as RemoteRequest)),
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

function unwrap(response: { data: unknown }): RemoteRequest {
  const row = response.data;
  if (!row || typeof row !== "object") {
    throw new ApiError("Request response was empty", 502, response);
  }
  return row as RemoteRequest;
}

export const RequestService = {
  async listRequests(
    params: RequestListParams = {}
  ): Promise<PaginatedResult<RequestRecord>> {
    const key = stableRequestKey(CacheNamespaces.requestsList, {
      page: params.page ?? 1,
      pageSize: params.pageSize ?? 8,
      search: params.search ?? "",
      status: params.status ?? "all",
      facilityId: params.facilityId ?? "all",
    });
    return sharedRequest(key, async () => {
      const response = await apiClient.post<unknown>("/requests", {
        resource: "requests",
        action: "getAll",
        payload: params,
      });
      return toPaginatedRequests(response.data, params);
    });
  },

  async getRequest(id: string): Promise<RequestRecord | null> {
    try {
      const response = await apiClient.post<unknown>("/requests", {
        resource: "requests",
        action: "getById",
        payload: { id },
      });
      if (!response.data || typeof response.data !== "object") return null;
      return mapRemoteRequest(response.data as RemoteRequest);
    } catch (error) {
      // A missing Request is a normal outcome; failures and 403s are not.
      if (error instanceof ApiError && error.status === 404) return null;
      throw error;
    }
  },

  async createRequest(input: CreateRequestInput): Promise<RequestRecord> {
    const response = await apiClient.post<unknown>("/requests", {
      resource: "requests",
      action: "create",
      payload: input,
    });
    onRequestMutation();
    return mapRemoteRequest(unwrap(response));
  },

  async updateRequest(input: UpdateRequestInput): Promise<RequestRecord> {
    // Descriptive fields only. Status and treatment links are server-owned
    // (request.treatment.* actions) and are never sent from the browser.
    const response = await apiClient.post<unknown>("/requests", {
      resource: "requests",
      action: "update",
      payload: {
        id: input.id,
        title: input.title,
        description: input.description,
        facilityId: input.facilityId,
        occurredAt: input.occurredAt,
        locationDetail: input.locationDetail,
        reporterName: input.reporterName,
        reporterContact: input.reporterContact,
        reportedByUserId: input.reportedByUserId,
        requestType: input.requestType,
      },
    });
    onRequestMutation();
    return mapRemoteRequest(unwrap(response));
  },

  async deactivateRequest(id: string): Promise<RequestRecord> {
    const response = await apiClient.post<unknown>("/requests", {
      resource: "requests",
      action: "deactivate",
      payload: { id },
    });
    onRequestMutation();
    return mapRemoteRequest(unwrap(response));
  },
};
