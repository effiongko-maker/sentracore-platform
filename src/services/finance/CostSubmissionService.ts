import type { PaginatedResult } from "@/types";
import {
  assertCostSubmissionTransition,
  DEFAULT_COST_SUBMISSION_CURRENCY,
  validateCostSubmission,
} from "@/lib/operational/finance/costSubmission";
import {
  costSubmissionToRemotePayload,
  mapRemoteCostSubmission,
  type RemoteCostSubmission,
} from "@/lib/operational/finance/costSubmissionRow";
import type {
  ClientPaymentKind,
  CostSubmission,
  CostSubmissionLifecycleStatus,
  CostSubmissionPackage,
  FinancialOperationalRefs,
  MarkupRepresentation,
} from "@/lib/operational/finance/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import { mergeProtectedProof } from "@/lib/access/protectedMutationProof";
import type { ProtectedMutationProof } from "@/lib/access/protectedMutationProof";
import {
  CacheNamespaces,
  onCostSubmissionMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

export type CostSubmissionListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  facilityId?: string | "all";
  status?: CostSubmissionLifecycleStatus | "all";
  approvalId?: string;
  kind?: ClientPaymentKind | "all";
  includeHistory?: boolean;
};

export type CreateCostSubmissionInput = {
  costRecordIds?: string[];
  status?: CostSubmissionLifecycleStatus;
  currency?: string;
  claimAmount?: number;
  markup?: MarkupRepresentation;
  facilityId?: string;
  departmentId?: string;
  periodLabel?: string;
  submissionKind?: ClientPaymentKind;
  description?: string;
  clientLocation?: string;
  submissionPackage?: CostSubmissionPackage;
  refs?: FinancialOperationalRefs;
  executionKind?: CostSubmission["executionKind"];
  executionId?: string;
  approvalId?: string;
  /** Work Order a payment request bills (set on create only). */
  workOrderId?: string;
  createdBy: string;
  createdAt?: string;
  submittedAt?: string;
  submittedBy?: string;
  queriedAt?: string;
  queryNotes?: string;
  notes?: string;
};

export type UpdateCostSubmissionInput = Partial<
  Omit<CreateCostSubmissionInput, "createdBy">
> & {
  createdBy?: string;
};

function assertValidForPersistence(
  submission: Partial<CostSubmission>,
  context: "create" | "update"
): void {
  const result = validateCostSubmission(
    submission,
    context === "create" ? { serverGeneratedId: true } : undefined
  );
  if (!result.valid) {
    throw new ApiError(
      `Invalid CostSubmission on ${context}: ${result.errors.join("; ")}`,
      400
    );
  }
}

function toPaginatedCostSubmissions(
  payload: unknown,
  params: CostSubmissionListParams
): PaginatedResult<CostSubmission> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteCostSubmission(row as RemoteCostSubmission)
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
      data: rows.map((row) =>
        mapRemoteCostSubmission(row as RemoteCostSubmission)
      ),
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

async function postCostSubmissions<T>(
  action: string,
  payload: Record<string, unknown>,
  options?: { signal?: AbortSignal }
): Promise<T> {
  if (typeof window === "undefined") {
    // FM Costs live in Supabase behind the API route — server code must use
    // getFmCostServerService (@/modules/finance/server), never a browser client.
    throw new Error("Cost services are browser clients; server code must use getFmCostServerService.");
  }

  const response = await apiClient.post<T>(
    "/cost-submissions",
    {
      resource: "cost-submissions",
      action,
      payload,
    },
    { signal: options?.signal }
  );
  return response.data as T;
}

export const CostSubmissionService = {
  async listCostSubmissions(
    params: CostSubmissionListParams = {},
    options?: { signal?: AbortSignal }
  ): Promise<PaginatedResult<CostSubmission>> {
    const key = stableRequestKey(CacheNamespaces.costSubmissionsList, params);
    return sharedRequest(key, async () => {
      const data = await postCostSubmissions<unknown>(
        "getAll",
        {
          page: params.page ?? 1,
          pageSize: params.pageSize ?? 8,
          search: params.search,
          facilityId: params.facilityId,
          status: params.status,
          approvalId: params.approvalId,
          kind: params.kind,
          includeHistory: params.includeHistory,
        },
        { signal: options?.signal }
      );
      return toPaginatedCostSubmissions(data, params);
    });
  },

  /**
   * Record a follow-up (chasing) on a contract instalment / payment request. Never changes its status and never
   * implies payment — receipts remain the only payment evidence.
   */
  async recordFollowUp(
    submissionId: string,
    input: { followedUpAt: string; method: string; contactPerson?: string; outcomeNotes: string; nextFollowUpAt?: string }
  ): Promise<CostSubmission> {
    const data = await postCostSubmissions<RemoteCostSubmission>("recordFollowUp", { id: submissionId, ...input });
    onCostSubmissionMutation();
    return mapRemoteCostSubmission(data);
  },

  async listFollowUps(submissionId: string): Promise<
    Array<{ id: string; followedUpAt: string; method: string; contactPerson?: string; outcomeNotes: string; nextFollowUpAt?: string }>
  > {
    const data = await postCostSubmissions<unknown>("listFollowUps", { submissionId });
    return Array.isArray(data) ? (data as Array<{ id: string; followedUpAt: string; method: string; contactPerson?: string; outcomeNotes: string; nextFollowUpAt?: string }>) : [];
  },

  async getCostSubmission(
    submissionId: string
  ): Promise<CostSubmission | null> {
    try {
      const data = await postCostSubmissions<RemoteCostSubmission>("getById", {
        submissionId,
      });
      return mapRemoteCostSubmission(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      if (/not found/i.test(message)) {
        return null;
      }
      throw error;
    }
  },

  async createCostSubmission(
    input: CreateCostSubmissionInput
  ): Promise<CostSubmission> {
    const draft: Partial<CostSubmission> = {
      costRecordIds: input.costRecordIds ?? [],
      status: input.status ?? "draft",
      currency: input.currency ?? DEFAULT_COST_SUBMISSION_CURRENCY,
      claimAmount: input.claimAmount,
      markup: input.markup,
      facilityId: input.facilityId,
      departmentId: input.departmentId,
      periodLabel: input.periodLabel,
      submissionKind: input.submissionKind,
      description: input.description,
      clientLocation: input.clientLocation,
      submissionPackage: input.submissionPackage,
      refs: input.refs,
      executionKind: input.executionKind,
      executionId: input.executionId,
      approvalId: input.approvalId,
      workOrderId: input.workOrderId,
      createdAt: input.createdAt ?? new Date().toISOString(),
      createdBy: input.createdBy,
      submittedAt: input.submittedAt,
      submittedBy: input.submittedBy,
      queriedAt: input.queriedAt,
      queryNotes: input.queryNotes,
      notes: input.notes,
    };
    assertValidForPersistence(draft, "create");

    const payload = costSubmissionToRemotePayload(draft);
    delete payload.submissionId;

    const created = await postCostSubmissions<RemoteCostSubmission>(
      "create",
      payload
    );
    const record = mapRemoteCostSubmission(created);
    onCostSubmissionMutation();
    return record;
  },

  async updateCostSubmission(
    submissionId: string,
    input: UpdateCostSubmissionInput,
    protectedProof?: ProtectedMutationProof | null
  ): Promise<CostSubmission> {
    const existing = await CostSubmissionService.getCostSubmission(submissionId);
    if (!existing) {
      throw new ApiError(`Cost submission ${submissionId} not found.`, 404);
    }

    if (input.status != null && input.status !== existing.status) {
      try {
        assertCostSubmissionTransition(existing.status, input.status);
      } catch (error) {
        throw new ApiError(
          error instanceof Error ? error.message : "Invalid lifecycle transition",
          400
        );
      }
    }

    const transitioningAway =
      input.status != null && input.status !== existing.status;
    const requiresProtected =
      existing.status === "submitted" && !transitioningAway;

    if (requiresProtected) {
      if (!protectedProof) {
        throw new ApiError(
          "Editing a submitted claim requires Facility Manager authorization or System Administrator override.",
          403
        );
      }
      if (protectedProof.actionId !== "finance.claim.edit_submitted") {
        throw new ApiError(
          "Submitted claim edits require finance.claim.edit_submitted authorization.",
          403
        );
      }
    }

    const merged: CostSubmission = {
      ...existing,
      ...input,
      submissionId: existing.submissionId,
      createdAt: existing.createdAt,
      costRecordIds: input.costRecordIds ?? existing.costRecordIds,
      submissionPackage:
        input.submissionPackage ?? existing.submissionPackage,
      markup: input.markup ?? existing.markup,
      refs: input.refs ?? existing.refs,
      currency: input.currency ?? existing.currency,
    };
    assertValidForPersistence(merged, "update");

    const payload = mergeProtectedProof(
      {
        submissionId,
        ...costSubmissionToRemotePayload(input),
      },
      requiresProtected ? protectedProof : null
    );

    const updated = await postCostSubmissions<RemoteCostSubmission>(
      "update",
      payload
    );
    const record = mapRemoteCostSubmission(updated);
    onCostSubmissionMutation();
    return record;
  },
};

export type ICostSubmissionService = typeof CostSubmissionService;
