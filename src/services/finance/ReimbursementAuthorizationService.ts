import type { PaginatedResult } from "@/types";
import {
  DEFAULT_REIMBURSEMENT_AUTHORIZATION_CURRENCY,
  validateReimbursementAuthorization,
} from "@/lib/operational/finance/authorization";
import {
  mapRemoteReimbursementAuthorization,
  reimbursementAuthorizationToRemotePayload,
  type RemoteReimbursementAuthorization,
} from "@/lib/operational/finance/authorizationRow";
import type { ReimbursementAuthorization } from "@/lib/operational/finance/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import { postToAppsScriptData } from "@/services/api/appsScriptProxy";
import { mergeProtectedProof } from "@/lib/access/protectedMutationProof";
import type { ProtectedMutationProof } from "@/lib/access/protectedMutationProof";
import {
  CacheNamespaces,
  onReimbursementAuthorizationMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

export type ReimbursementAuthorizationListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  submissionId?: string;
};

export type CreateReimbursementAuthorizationInput = {
  submissionId: string;
  authorizedAmount: number;
  currency?: string;
  authorizedAt?: string;
  authorityReference?: string;
  notes?: string;
  authorizedBy: string;
  recordedAt?: string;
};

export type UpdateReimbursementAuthorizationInput = Partial<
  Omit<CreateReimbursementAuthorizationInput, "authorizedBy">
> & {
  authorizedBy?: string;
};

function assertValidForPersistence(
  authorization: Partial<ReimbursementAuthorization>,
  context: "create" | "update"
): void {
  const result = validateReimbursementAuthorization(
    authorization,
    context === "create" ? { serverGeneratedId: true } : undefined
  );
  if (!result.valid) {
    throw new ApiError(
      `Invalid reimbursement authorization on ${context}: ${result.errors.join("; ")}`,
      400
    );
  }
}

function toPaginatedAuthorizations(
  payload: unknown,
  params: ReimbursementAuthorizationListParams
): PaginatedResult<ReimbursementAuthorization> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteReimbursementAuthorization(
        row as RemoteReimbursementAuthorization
      )
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
        mapRemoteReimbursementAuthorization(
          row as RemoteReimbursementAuthorization
        )
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

async function postAuthorizations<T>(
  action: string,
  payload: Record<string, unknown>
): Promise<T> {
  if (typeof window === "undefined") {
    return postToAppsScriptData(
      {
        resource: "reimbursement-authorizations",
        action,
        payload,
      },
      { resource: "reimbursement-authorizations", action },
      "ReimbursementAuthorizationService"
    ) as Promise<T>;
  }

  const response = await apiClient.post<T>("/reimbursement-authorizations", {
    resource: "reimbursement-authorizations",
    action,
    payload,
  });
  return response.data as T;
}

export const ReimbursementAuthorizationService = {
  async listAuthorizations(
    params: ReimbursementAuthorizationListParams = {}
  ): Promise<PaginatedResult<ReimbursementAuthorization>> {
    const key = stableRequestKey(
      CacheNamespaces.reimbursementAuthorizationsList,
      params
    );
    return sharedRequest(key, async () => {
      const data = await postAuthorizations<unknown>("getAll", {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 8,
        search: params.search,
        submissionId: params.submissionId,
      });
      return toPaginatedAuthorizations(data, params);
    });
  },

  async getAuthorization(
    authorizationId: string
  ): Promise<ReimbursementAuthorization | null> {
    try {
      const data = await postAuthorizations<RemoteReimbursementAuthorization>(
        "getById",
        { authorizationId }
      );
      return mapRemoteReimbursementAuthorization(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      if (/not found/i.test(message)) return null;
      throw error;
    }
  },

  async getAuthorizationForSubmission(
    submissionId: string
  ): Promise<ReimbursementAuthorization | null> {
    try {
      const data = await postAuthorizations<RemoteReimbursementAuthorization | null>(
        "getBySubmissionId",
        { submissionId }
      );
      if (!data || typeof data !== "object") return null;
      if (
        !(data as RemoteReimbursementAuthorization).authorizationId &&
        !(data as RemoteReimbursementAuthorization).AuthorizationID
      ) {
        return null;
      }
      return mapRemoteReimbursementAuthorization(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      if (/not found/i.test(message) || /null/i.test(message)) return null;
      throw error;
    }
  },

  async createAuthorization(
    input: CreateReimbursementAuthorizationInput
  ): Promise<ReimbursementAuthorization> {
    const now = new Date().toISOString();
    const draft: Partial<ReimbursementAuthorization> = {
      submissionId: input.submissionId,
      authorizedAmount: input.authorizedAmount,
      currency: input.currency ?? DEFAULT_REIMBURSEMENT_AUTHORIZATION_CURRENCY,
      authorizedAt: input.authorizedAt ?? now,
      authorizedBy: input.authorizedBy,
      authorityReference: input.authorityReference,
      notes: input.notes,
      recordedAt: input.recordedAt ?? now,
    };
    assertValidForPersistence(draft, "create");
    const created =
      await postAuthorizations<RemoteReimbursementAuthorization>(
        "create",
        reimbursementAuthorizationToRemotePayload(draft)
      );
    onReimbursementAuthorizationMutation();
    return mapRemoteReimbursementAuthorization(created);
  },

  async updateAuthorization(
    authorizationId: string,
    input: UpdateReimbursementAuthorizationInput,
    protectedProof?: ProtectedMutationProof | null
  ): Promise<ReimbursementAuthorization> {
    const existing =
      await ReimbursementAuthorizationService.getAuthorization(authorizationId);
    if (!existing) {
      throw new ApiError(`Authorization ${authorizationId} not found.`, 404);
    }
    if (!protectedProof) {
      throw new ApiError(
        "Revising a reimbursement authorization requires Facility Manager authorization or System Administrator override.",
        403
      );
    }
    if (protectedProof.actionId !== "finance.authorization.revise") {
      throw new ApiError(
        "Authorization revise requires finance.authorization.revise.",
        403
      );
    }
    const merged: ReimbursementAuthorization = {
      ...existing,
      ...input,
      authorizationId: existing.authorizationId,
      recordedAt: existing.recordedAt,
      authorizedBy: input.authorizedBy ?? existing.authorizedBy,
    };
    assertValidForPersistence(merged, "update");
    const updated =
      await postAuthorizations<RemoteReimbursementAuthorization>("update", 
        mergeProtectedProof(
          {
            authorizationId,
            ...reimbursementAuthorizationToRemotePayload(input),
          },
          protectedProof
        )
      );
    onReimbursementAuthorizationMutation();
    return mapRemoteReimbursementAuthorization(updated);
  },
};

export type IReimbursementAuthorizationService =
  typeof ReimbursementAuthorizationService;
