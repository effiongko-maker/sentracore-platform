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
  postToAppsScript,
  postToAppsScriptData,
} from "@/services/api/appsScriptProxy";
import {
  CacheNamespaces,
  onRequestMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

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

function unwrapCreateEnvelope(raw: unknown): RemoteRequest {
  const envelope = raw as {
    data?: unknown;
    success?: boolean;
    message?: string;
  };
  if (envelope && typeof envelope === "object" && envelope.success === false) {
    throw new ApiError(
      envelope.message ?? "Failed to create request",
      400,
      envelope
    );
  }
  const row =
    envelope && typeof envelope === "object" && "data" in envelope
      ? envelope.data
      : raw;
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
      if (typeof window === "undefined") {
        const data = await postToAppsScriptData(
          {
            resource: "requests",
            action: "getAll",
            payload: params,
          },
          { resource: "requests", action: "getAll" },
          "RequestService.listRequests"
        );
        return toPaginatedRequests(data, params);
      }
      const response = await apiClient.post<unknown>("/requests", {
        resource: "requests",
        action: "getAll",
        payload: params,
      });
      return toPaginatedRequests(response.data, params);
    });
  },

  async getRequest(id: string): Promise<RequestRecord | null> {
    if (typeof window === "undefined") {
      const row = await postToAppsScriptData(
        {
          resource: "requests",
          action: "getById",
          payload: { id },
        },
        { resource: "requests", action: "getById" },
        "RequestService.getRequest"
      );
      if (!row || typeof row !== "object") return null;
      return mapRemoteRequest(row as RemoteRequest);
    }
    const response = await apiClient.post<unknown>("/requests", {
      resource: "requests",
      action: "getById",
      payload: { id },
    });
    if (!response.data || typeof response.data !== "object") return null;
    return mapRemoteRequest(response.data as RemoteRequest);
  },

  async createRequest(input: CreateRequestInput): Promise<RequestRecord> {
    if (typeof window === "undefined") {
      const raw = await postToAppsScript(
        {
          resource: "requests",
          action: "create",
          payload: input,
        },
        { resource: "requests", action: "create" },
        "RequestService.createRequest"
      );
      const created = mapRemoteRequest(unwrapCreateEnvelope(raw));
      onRequestMutation();
      return created;
    }

    const response = await apiClient.post<unknown>("/requests", {
      resource: "requests",
      action: "create",
      payload: input,
    });
    onRequestMutation();
    return mapRemoteRequest(response.data as RemoteRequest);
  },

  async updateRequest(input: UpdateRequestInput): Promise<RequestRecord> {
    // Defense in depth: relationship/status treatment writes belong on server actions.
    // Browser callers may update report metadata only — strip link arrays.
    const clientSafeInput: UpdateRequestInput =
      typeof window === "undefined"
        ? input
        : {
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
            // Status / relationship mutations must use treatRequest server actions.
          };

    if (typeof window === "undefined") {
      const row = await postToAppsScriptData(
        {
          resource: "requests",
          action: "update",
          payload: clientSafeInput,
        },
        { resource: "requests", action: "update" },
        "RequestService.updateRequest"
      );
      const updated = mapRemoteRequest(row as RemoteRequest);
      onRequestMutation();
      return updated;
    }

    const response = await apiClient.post<unknown>("/requests", {
      resource: "requests",
      action: "update",
      payload: clientSafeInput,
    });
    onRequestMutation();
    return mapRemoteRequest(response.data as RemoteRequest);
  },

  async deactivateRequest(id: string): Promise<RequestRecord> {
    if (typeof window === "undefined") {
      const row = await postToAppsScriptData(
        {
          resource: "requests",
          action: "deactivate",
          payload: { id },
        },
        { resource: "requests", action: "deactivate" },
        "RequestService.deactivateRequest"
      );
      const deactivated = mapRemoteRequest(row as RemoteRequest);
      onRequestMutation();
      return deactivated;
    }

    const response = await apiClient.post<unknown>("/requests", {
      resource: "requests",
      action: "deactivate",
      payload: { id },
    });
    onRequestMutation();
    return mapRemoteRequest(response.data as RemoteRequest);
  },
};
