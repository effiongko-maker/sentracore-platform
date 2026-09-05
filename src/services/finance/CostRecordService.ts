import type { PaginatedResult } from "@/types";
import {
  DEFAULT_COST_RECORD_CURRENCY,
  getAuthoritativeAmount,
  validateCostRecord,
} from "@/lib/operational/finance/costRecord";
import {
  costRecordToRemotePayload,
  mapRemoteCostRecord,
  type RemoteCostRecord,
} from "@/lib/operational/finance/costRecordRow";
import type {
  CostCategory,
  CostRecord,
  CostReimbursability,
} from "@/lib/operational/finance/types";
import {
  canEditCostRecord,
  costRecordLockReason,
  findSubmissionForCost,
} from "@/modules/finance/utils/costWorkflow";
import { mergeProtectedProof } from "@/lib/access/protectedMutationProof";
import type { ProtectedMutationProof } from "@/lib/access/protectedMutationProof";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import {
  postToAppsScriptData,
} from "@/services/api/appsScriptProxy";
import {
  CacheNamespaces,
  onCostRecordMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";
import { CostSubmissionService } from "@/services/finance/CostSubmissionService";

export type CostRecordListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  facilityId?: string | "all";
  category?: CostCategory | "all";
  reimbursability?: CostReimbursability | "all";
  workId?: string;
  workOrderId?: string;
  jobOrderId?: string;
};

export type CreateCostRecordInput = {
  facilityId: string;
  location: string;
  description: string;
  category: CostCategory;
  actualAmount: number;
  currency?: string;
  reimbursability?: CostReimbursability;
  evidence: CostRecordEvidenceInput;
  recordedBy: string;
  recordedAt?: string;
  departmentId?: string;
  workId?: string;
  workOrderId?: string;
  jobOrderId?: string;
  budgetedAmount?: number;
};

export type CostRecordEvidenceUpload = {
  fileName: string;
  mimeType: "application/pdf" | "image/jpeg" | "image/png";
  sizeBytes: number;
  /** Base64 only for the create request; never persisted in CostRecord. */
  base64: string;
};

export type CostRecordEvidenceInput = {
  reference?: string;
  upload?: CostRecordEvidenceUpload;
};

export type UpdateCostRecordInput = Partial<
  Omit<CreateCostRecordInput, "recordedBy">
> & {
  recordedBy?: string;
};

function assertValidForPersistence(
  record: Partial<CostRecord>,
  context: "create" | "update"
): void {
  const result = validateCostRecord(record);
  if (!result.valid) {
    throw new ApiError(
      `Invalid CostRecord on ${context}: ${result.errors.join("; ")}`,
      400
    );
  }
}

/** Empty optional IDs mean "clear" on update; validation only accepts omit/non-empty. */
function optionalIdForValidation(
  value: string | undefined
): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  return trimmed || undefined;
}

function toPaginatedCostRecords(
  payload: unknown,
  params: CostRecordListParams
): PaginatedResult<CostRecord> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) => mapRemoteCostRecord(row as RemoteCostRecord));
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
      data: rows.map((row) => mapRemoteCostRecord(row as RemoteCostRecord)),
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

async function postCostRecords<T>(
  action: string,
  payload: Record<string, unknown>
): Promise<T> {
  if (typeof window === "undefined") {
    return postToAppsScriptData(
      {
        resource: "cost-records",
        action,
        payload,
      },
      { resource: "cost-records", action },
      "CostRecordService"
    ) as Promise<T>;
  }

  const response = await apiClient.post<T>("/cost-records", {
    resource: "cost-records",
    action,
    payload,
  });
  return response.data as T;
}

export const CostRecordService = {
  async listCostRecords(
    params: CostRecordListParams = {}
  ): Promise<PaginatedResult<CostRecord>> {
    const key = stableRequestKey(CacheNamespaces.costRecordsList, params);
    return sharedRequest(key, async () => {
      const data = await postCostRecords<unknown>("getAll", {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 8,
        search: params.search,
        facilityId: params.facilityId,
        category: params.category,
        reimbursability: params.reimbursability,
        workId: params.workId,
        workOrderId: params.workOrderId,
        jobOrderId: params.jobOrderId,
      });
      return toPaginatedCostRecords(data, params);
    });
  },

  async getCostRecord(costId: string): Promise<CostRecord | null> {
    try {
      const data = await postCostRecords<RemoteCostRecord>("getById", {
        costId,
      });
      return mapRemoteCostRecord(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      if (/not found/i.test(message)) {
        return null;
      }
      throw error;
    }
  },

  async createCostRecord(input: CreateCostRecordInput): Promise<CostRecord> {
    const evidenceReference =
      input.evidence.reference?.trim() || input.evidence.upload?.fileName || "";
    const draft: Partial<CostRecord> = {
      costId: "COST-PENDING",
      recordedAt: input.recordedAt ?? new Date().toISOString(),
      facilityId: input.facilityId,
      location: input.location,
      departmentId: input.departmentId,
      workId: input.workId,
      workOrderId: input.workOrderId,
      jobOrderId: input.jobOrderId,
      description: input.description,
      category: input.category,
      budgetedAmount: input.budgetedAmount,
      actualAmount: input.actualAmount,
      currency: input.currency ?? DEFAULT_COST_RECORD_CURRENCY,
      reimbursability: input.reimbursability ?? "unknown",
      evidence: { reference: evidenceReference },
      recordedBy: input.recordedBy,
    };
    assertValidForPersistence(draft, "create");

    const payload = costRecordToRemotePayload(draft);
    if (input.evidence.upload) {
      payload.evidence = {
        ...(payload.evidence as Record<string, unknown>),
        upload: input.evidence.upload,
      };
    }
    delete payload.costId;

    const created = await postCostRecords<RemoteCostRecord>("create", payload);
    const record = mapRemoteCostRecord(created);
    onCostRecordMutation();
    return record;
  },

  async updateCostRecord(
    costId: string,
    input: UpdateCostRecordInput,
    protectedProof?: ProtectedMutationProof | null
  ): Promise<CostRecord> {
    const existing = await CostRecordService.getCostRecord(costId);
    if (!existing) {
      throw new ApiError(`Cost record ${costId} not found.`, 404);
    }

    let locked = false;
    // Defense in depth — Apps Script also enforces. Bounded list may miss older claims.
    try {
      const submissionsPage = await CostSubmissionService.listCostSubmissions({
        page: 1,
        pageSize: 200,
        status: "all",
      });
      const linked = findSubmissionForCost(
        costId,
        submissionsPage.data ?? []
      );
      locked = !canEditCostRecord(linked);
      if (locked && !protectedProof) {
        throw new ApiError(
          costRecordLockReason(linked) ??
            "This cost cannot be edited because it is part of a submitted reimbursement claim.",
          409
        );
      }
      if (locked && protectedProof && protectedProof.actionId !== "finance.cost.unlock_edit") {
        throw new ApiError(
          "Editing a locked cost requires finance.cost.unlock_edit authorization.",
          403
        );
      }
    } catch (err) {
      if (err instanceof ApiError && (err.status === 409 || err.status === 403)) {
        throw err;
      }
      // If submission lookup fails, still attempt update — Apps Script is authoritative.
    }

    const merged: CostRecord = {
      ...existing,
      ...input,
      costId: existing.costId,
      recordedAt: existing.recordedAt,
      location: input.location ?? existing.location,
      evidence: input.evidence
        ? { reference: input.evidence.reference ?? existing.evidence.reference }
        : existing.evidence,
      currency: input.currency ?? existing.currency,
      reimbursability: input.reimbursability ?? existing.reimbursability,
      departmentId: optionalIdForValidation(
        input.departmentId !== undefined
          ? input.departmentId
          : existing.departmentId
      ),
      workId: optionalIdForValidation(
        input.workId !== undefined ? input.workId : existing.workId
      ),
      workOrderId: optionalIdForValidation(
        input.workOrderId !== undefined
          ? input.workOrderId
          : existing.workOrderId
      ),
      jobOrderId: optionalIdForValidation(
        input.jobOrderId !== undefined ? input.jobOrderId : existing.jobOrderId
      ),
    };
    assertValidForPersistence(merged, "update");

    const { evidence, ...fields } = input;
    const remoteInput: Partial<CostRecord> = {
      ...fields,
      evidence: evidence
        ? {
            ...existing.evidence,
            reference: evidence.reference ?? existing.evidence.reference,
          }
        : undefined,
    };
    const payload = mergeProtectedProof(
      {
        costId,
        ...costRecordToRemotePayload(remoteInput),
      },
      locked
        ? protectedProof ?? {
            actionId: "finance.cost.unlock_edit",
          }
        : null
    );

    const updated = await postCostRecords<RemoteCostRecord>("update", payload);
    const record = mapRemoteCostRecord(updated);
    onCostRecordMutation();
    return record;
  },

  getAuthoritativeAmount(record: Pick<CostRecord, "actualAmount">): number {
    return getAuthoritativeAmount(record);
  },
};

export type ICostRecordService = typeof CostRecordService;
