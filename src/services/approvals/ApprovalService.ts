import type { PaginatedResult } from "@/types";
import type {
  Approval,
  ApprovalListParams,
  ApprovalStatus,
  ApprovalType,
  CreateApprovalInput,
  UpdateApprovalInput,
} from "@/modules/approvals/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  postToAppsScript,
  postToAppsScriptData,
} from "@/services/api/appsScriptProxy";

type RemoteApproval = Record<string, unknown>;

function pickField(raw: RemoteApproval, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function optionalMappedString(
  raw: RemoteApproval,
  ...keys: string[]
): string | undefined {
  const value = pickField(raw, ...keys);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function optionalNumber(
  raw: RemoteApproval,
  ...keys: string[]
): number | undefined {
  const value = pickField(raw, ...keys);
  if (value == null || value === "") return undefined;
  const num = Number(value);
  return Number.isFinite(num) ? num : undefined;
}

function mapStatus(raw: unknown, submittedAt?: unknown): ApprovalStatus {
  const value = String(raw ?? "draft")
    .toLowerCase()
    .replace(/\s+/g, "_");
  const aliases: Record<string, ApprovalStatus> = {
    draft: "draft",
    generated: "draft",
    awaiting_submission: "draft",
    submitted: "awaiting_decision",
    awaiting_response: "awaiting_decision",
    awaiting_decision: "awaiting_decision",
    approved: "approved",
    rejected: "rejected",
    returned: "returned",
    returned_for_clarification: "returned",
    query: "returned",
    cancelled: "cancelled",
    canceled: "cancelled",
    expired: "expired",
    closed: "closed",
  };
  let status = aliases[value] ?? (value as ApprovalStatus);
  if (
    !aliases[value] &&
    ![
      "draft",
      "awaiting_decision",
      "approved",
      "rejected",
      "returned",
      "cancelled",
      "expired",
      "closed",
    ].includes(value)
  ) {
    status = "draft";
  }
  const submitted = String(submittedAt ?? "").trim();
  if (
    submitted &&
    (status === "draft" ||
      status === "generated" ||
      status === "awaiting_submission")
  ) {
    return "awaiting_decision";
  }
  return status;
}

function mapDecisionOutcome(
  raw: unknown
): Approval["decisionOutcome"] | undefined {
  const value = String(raw ?? "")
    .toLowerCase()
    .replace(/\s+/g, "_");
  if (
    value === "approved" ||
    value === "rejected" ||
    value === "partially_approved"
  ) {
    return value;
  }
  return undefined;
}

function mapType(raw: unknown): ApprovalType {
  const value = String(raw ?? "standard_maintenance")
    .toLowerCase()
    .replace(/\s+/g, "_");
  const aliases: Record<string, ApprovalType> = {
    standard_maintenance: "standard_maintenance",
    variation: "variation",
    additional_works: "variation",
    equipment_replacement: "equipment_replacement",
    emergency: "emergency",
    emergency_works: "emergency",
  };
  return aliases[value] ?? "standard_maintenance";
}

function mapRemoteApproval(raw: RemoteApproval): Approval {
  const createdAt = String(
    pickField(raw, "createdAt", "Created At") ?? new Date().toISOString()
  );
  return {
    id: String(pickField(raw, "id", "Approval ID") ?? ""),
    title: String(pickField(raw, "title", "Title") ?? ""),
    type: mapType(pickField(raw, "type", "Type")),
    workOrderId: String(pickField(raw, "workOrderId", "Work Order ID") ?? ""),
    facilityId: String(pickField(raw, "facilityId", "Facility ID") ?? ""),
    assetId: optionalMappedString(raw, "assetId", "Asset ID"),
    status: mapStatus(
      pickField(raw, "status", "Status"),
      pickField(raw, "submittedAt", "Submitted At")
    ),
    description: optionalMappedString(raw, "description", "Description"),
    reason: optionalMappedString(raw, "reason", "Reason"),
    coverLetter: optionalMappedString(raw, "coverLetter", "Cover Letter"),
    templateId: optionalMappedString(raw, "templateId", "Template ID"),
    clientName: optionalMappedString(raw, "clientName", "Client Name"),
    clientAddress: optionalMappedString(raw, "clientAddress", "Client Address"),
    approvalAmount: optionalNumber(raw, "approvalAmount", "Approval Amount"),
    approvedAmount: optionalNumber(raw, "approvedAmount", "Approved Amount"),
    currency: optionalMappedString(raw, "currency", "Currency"),
    requestedByUserId: optionalMappedString(
      raw,
      "requestedByUserId",
      "Requested By"
    ),
    approvedByUserId: optionalMappedString(
      raw,
      "approvedByUserId",
      "Approved By"
    ),
    generatedAt: optionalMappedString(raw, "generatedAt", "Generated At"),
    submittedAt: optionalMappedString(raw, "submittedAt", "Submitted At"),
    decisionAt: optionalMappedString(raw, "decisionAt", "Decision At"),
    decisionNotes: optionalMappedString(raw, "decisionNotes", "Decision Notes"),
    decisionOutcome: mapDecisionOutcome(
      pickField(raw, "decisionOutcome", "Decision Outcome")
    ),
    decisionReference: optionalMappedString(
      raw,
      "decisionReference",
      "Decision Reference"
    ),
    expiresAt: optionalMappedString(raw, "expiresAt", "Expires At"),
    submissionMethod: optionalMappedString(
      raw,
      "submissionMethod",
      "Submission Method"
    ),
    submittedTo: optionalMappedString(raw, "submittedTo", "Submitted To"),
    submissionReference: optionalMappedString(
      raw,
      "submissionReference",
      "Submission Reference"
    ),
    acknowledgementFileName: optionalMappedString(
      raw,
      "acknowledgementFileName",
      "Acknowledgement File Name"
    ),
    acknowledgementFileMime: optionalMappedString(
      raw,
      "acknowledgementFileMime",
      "Acknowledgement File Mime"
    ),
    acknowledgementFileSize: optionalNumber(
      raw,
      "acknowledgementFileSize",
      "Acknowledgement File Size"
    ),
    decisionDocumentFileName: optionalMappedString(
      raw,
      "decisionDocumentFileName",
      "Decision Document File Name"
    ),
    decisionDocumentFileMime: optionalMappedString(
      raw,
      "decisionDocumentFileMime",
      "Decision Document File Mime"
    ),
    decisionDocumentFileSize: optionalNumber(
      raw,
      "decisionDocumentFileSize",
      "Decision Document File Size"
    ),
    lastFollowUpAt: optionalMappedString(
      raw,
      "lastFollowUpAt",
      "Last Follow-up At"
    ),
    lastActivityAt: optionalMappedString(
      raw,
      "lastActivityAt",
      "Last Activity At"
    ),
    lastActivitySummary: optionalMappedString(
      raw,
      "lastActivitySummary",
      "Last Activity Summary"
    ),
    activityLog: optionalMappedString(raw, "activityLog", "Activity Log"),
    createdAt,
    updatedAt: String(
      pickField(raw, "updatedAt", "Updated At") ?? createdAt
    ),
  };
}

function toPaginated(
  payload: unknown,
  params: ApprovalListParams
): PaginatedResult<Approval> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteApproval(row as RemoteApproval)
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
    const envelope = payload as {
      data?: unknown[];
      page?: number;
      pageSize?: number;
      total?: number;
      totalPages?: number;
    };
    const rows = Array.isArray(envelope.data) ? envelope.data : [];
    return {
      data: rows.map((row) => mapRemoteApproval(row as RemoteApproval)),
      page: envelope.page ?? params.page ?? 1,
      pageSize: envelope.pageSize ?? params.pageSize ?? 8,
      total: envelope.total ?? rows.length,
      totalPages: envelope.totalPages ?? 1,
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

export const ApprovalService = {
  async listApprovals(
    params: ApprovalListParams = {}
  ): Promise<PaginatedResult<Approval>> {
    if (typeof window === "undefined") {
      const row = await postToAppsScriptData(
        {
          resource: "approvals",
          action: "getAll",
          payload: params,
        },
        { resource: "approvals", action: "getAll" },
        "ApprovalService.listApprovals"
      );
      return toPaginated(row, params);
    }

    const response = await apiClient.post<unknown>("/approvals", {
      resource: "approvals",
      action: "getAll",
      payload: params,
    });
    return toPaginated(response.data, params);
  },

  async getApproval(id: string): Promise<Approval | null> {
    try {
      if (typeof window === "undefined") {
        const row = await postToAppsScriptData(
          {
            resource: "approvals",
            action: "getById",
            payload: { id },
          },
          { resource: "approvals", action: "getById" },
          "ApprovalService.getApproval"
        );
        return mapRemoteApproval(row as RemoteApproval);
      }

      const response = await apiClient.post<Approval>("/approvals", {
        resource: "approvals",
        action: "getById",
        payload: { id },
      });
      return mapRemoteApproval(response.data as unknown as RemoteApproval);
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

  async createApproval(input: CreateApprovalInput): Promise<Approval> {
    if (typeof window === "undefined") {
      const raw = await postToAppsScript(
        {
          resource: "approvals",
          action: "create",
          payload: input,
        },
        { resource: "approvals", action: "create" },
        "ApprovalService.createApproval"
      );
      const envelope = raw as {
        data?: unknown;
        success?: boolean;
        message?: string;
      };
      if (envelope && typeof envelope === "object" && envelope.success === false) {
        throw new ApiError(
          envelope.message ?? "Failed to create approval",
          502
        );
      }
      const row =
        envelope && typeof envelope === "object" && "data" in envelope
          ? envelope.data
          : raw;
      return mapRemoteApproval(row as RemoteApproval);
    }

    const response = await apiClient.post<Approval>("/approvals", {
      resource: "approvals",
      action: "create",
      payload: input,
    });
    return mapRemoteApproval(response.data as unknown as RemoteApproval);
  },

  async updateApproval(
    id: string,
    input: UpdateApprovalInput
  ): Promise<Approval> {
    if (typeof window === "undefined") {
      const raw = await postToAppsScript(
        {
          resource: "approvals",
          action: "update",
          payload: { id, ...input },
        },
        { resource: "approvals", action: "update" },
        "ApprovalService.updateApproval"
      );
      const envelope = raw as {
        data?: unknown;
        success?: boolean;
        message?: string;
      };
      if (envelope && typeof envelope === "object" && envelope.success === false) {
        throw new ApiError(
          envelope.message ?? "Failed to update approval",
          502
        );
      }
      const row =
        envelope && typeof envelope === "object" && "data" in envelope
          ? envelope.data
          : raw;
      return mapRemoteApproval(row as RemoteApproval);
    }

    const response = await apiClient.post<Approval>("/approvals", {
      resource: "approvals",
      action: "update",
      payload: { id, ...input },
    });
    return mapRemoteApproval(response.data as unknown as RemoteApproval);
  },

  async deactivateApproval(id: string): Promise<Approval> {
    const response = await apiClient.post<Approval>("/approvals", {
      resource: "approvals",
      action: "deactivate",
      payload: { id },
    });
    return mapRemoteApproval(response.data as unknown as RemoteApproval);
  },
};

export type IApprovalService = typeof ApprovalService;
