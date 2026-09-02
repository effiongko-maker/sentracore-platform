import type { PaginatedResult } from "@/types";
import {
  DEFAULT_REIMBURSEMENT_PAYMENT_CURRENCY,
  validateReimbursementPayment,
} from "@/lib/operational/finance/payment";
import {
  mapRemoteReimbursementPayment,
  reimbursementPaymentToRemotePayload,
  type RemoteReimbursementPayment,
} from "@/lib/operational/finance/paymentRow";
import type { ReimbursementPayment } from "@/lib/operational/finance/types";
import { apiClient } from "@/services/api/ApiClient";
import { ApiError } from "@/services/api/ApiResponse";
import { postToAppsScriptData } from "@/services/api/appsScriptProxy";
import {
  CacheNamespaces,
  onReimbursementPaymentMutation,
} from "@/services/cache/domainCache";
import {
  sharedRequest,
  stableRequestKey,
} from "@/services/cache/sharedRequest";

export type ReimbursementPaymentListParams = {
  page?: number;
  pageSize?: number;
  search?: string;
  submissionId?: string;
};

export type CreateReimbursementPaymentInput = {
  submissionId: string;
  receivedAmount: number;
  currency?: string;
  receivedAt?: string;
  reference?: string;
  method?: string;
  evidenceReference?: string;
  notes?: string;
  recordedBy: string;
  recordedAt?: string;
};

export type UpdateReimbursementPaymentInput = Partial<
  Omit<CreateReimbursementPaymentInput, "recordedBy">
> & {
  recordedBy?: string;
};

function assertValidForPersistence(
  payment: Partial<ReimbursementPayment>,
  context: "create" | "update"
): void {
  const result = validateReimbursementPayment(
    payment,
    context === "create" ? { serverGeneratedId: true } : undefined
  );
  if (!result.valid) {
    throw new ApiError(
      `Invalid reimbursement payment on ${context}: ${result.errors.join("; ")}`,
      400
    );
  }
}

function toPaginatedPayments(
  payload: unknown,
  params: ReimbursementPaymentListParams
): PaginatedResult<ReimbursementPayment> {
  if (Array.isArray(payload)) {
    const data = payload.map((row) =>
      mapRemoteReimbursementPayment(row as RemoteReimbursementPayment)
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
        mapRemoteReimbursementPayment(row as RemoteReimbursementPayment)
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

async function postPayments<T>(
  action: string,
  payload: Record<string, unknown>
): Promise<T> {
  if (typeof window === "undefined") {
    return postToAppsScriptData(
      {
        resource: "reimbursement-payments",
        action,
        payload,
      },
      { resource: "reimbursement-payments", action },
      "ReimbursementPaymentService"
    ) as Promise<T>;
  }

  const response = await apiClient.post<T>("/reimbursement-payments", {
    resource: "reimbursement-payments",
    action,
    payload,
  });
  return response.data as T;
}

export const ReimbursementPaymentService = {
  async listPayments(
    params: ReimbursementPaymentListParams = {}
  ): Promise<PaginatedResult<ReimbursementPayment>> {
    const key = stableRequestKey(
      CacheNamespaces.reimbursementPaymentsList,
      params
    );
    return sharedRequest(key, async () => {
      const data = await postPayments<unknown>("getAll", {
        page: params.page ?? 1,
        pageSize: params.pageSize ?? 8,
        search: params.search,
        submissionId: params.submissionId,
      });
      return toPaginatedPayments(data, params);
    });
  },

  async getPayment(paymentId: string): Promise<ReimbursementPayment | null> {
    try {
      const data = await postPayments<RemoteReimbursementPayment>("getById", {
        paymentId,
      });
      return mapRemoteReimbursementPayment(data);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : String(error ?? "");
      if (/not found/i.test(message)) return null;
      throw error;
    }
  },

  async createPayment(
    input: CreateReimbursementPaymentInput
  ): Promise<ReimbursementPayment> {
    const now = new Date().toISOString();
    const draft: Partial<ReimbursementPayment> = {
      submissionId: input.submissionId,
      receivedAmount: input.receivedAmount,
      currency: input.currency ?? DEFAULT_REIMBURSEMENT_PAYMENT_CURRENCY,
      receivedAt: input.receivedAt ?? now,
      reference: input.reference,
      method: input.method,
      evidenceReference: input.evidenceReference,
      notes: input.notes,
      recordedAt: input.recordedAt ?? now,
      recordedBy: input.recordedBy,
    };
    assertValidForPersistence(draft, "create");

    const payload = reimbursementPaymentToRemotePayload(draft);
    delete payload.paymentId;

    const created = await postPayments<RemoteReimbursementPayment>(
      "create",
      payload
    );
    const record = mapRemoteReimbursementPayment(created);
    onReimbursementPaymentMutation();
    return record;
  },

  async updatePayment(
    paymentId: string,
    input: UpdateReimbursementPaymentInput
  ): Promise<ReimbursementPayment> {
    const existing = await ReimbursementPaymentService.getPayment(paymentId);
    if (!existing) {
      throw new ApiError(`Payment ${paymentId} not found.`, 404);
    }

    const merged: ReimbursementPayment = {
      ...existing,
      ...input,
      paymentId: existing.paymentId,
      recordedAt: existing.recordedAt,
      currency: input.currency ?? existing.currency,
      receivedAmount: input.receivedAmount ?? existing.receivedAmount,
      submissionId: input.submissionId ?? existing.submissionId,
      receivedAt: input.receivedAt ?? existing.receivedAt,
      recordedBy: input.recordedBy ?? existing.recordedBy,
    };
    assertValidForPersistence(merged, "update");

    const payload = {
      paymentId,
      ...reimbursementPaymentToRemotePayload(input),
    };

    const updated = await postPayments<RemoteReimbursementPayment>(
      "update",
      payload
    );
    const record = mapRemoteReimbursementPayment(updated);
    onReimbursementPaymentMutation();
    return record;
  },
};

export type IReimbursementPaymentService = typeof ReimbursementPaymentService;
