import type {
  FinancialRequest,
  FinancialRequestCategory,
  FinancialRequestDocument,
  FinancialRequestEvent,
  FinancialRequestPayeeType,
} from "@/modules/platform-finance/domain/requests";
import type {
  PaymentDestinationInput,
  PaymentDestinationMutation,
} from "@/modules/platform-finance/domain/paymentDestination";

const API_PATH = "/api/platform-finance/requests";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message?: string; code?: string };

async function postAction<T>(
  action: string,
  body: Record<string, unknown> = {}
): Promise<T> {
  const response = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
    credentials: "same-origin",
  });
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !json.success) {
    throw new Error(
      ("message" in json && json.message) ||
        `Financial request failed (${action}).`
    );
  }
  return json.data;
}

async function postMultipart<T>(form: FormData): Promise<T> {
  const response = await fetch(API_PATH, {
    method: "POST",
    body: form,
    credentials: "same-origin",
  });
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !json.success) {
    throw new Error(
      ("message" in json && json.message) ||
        "Financial request document upload failed."
    );
  }
  return json.data;
}

export type CreateFinancialRequestClientInput = {
  companyId: string;
  categoryId: string;
  requestedAmount: number;
  purpose: string;
  description?: string | null;
  payeeName: string;
  payeeType: FinancialRequestPayeeType;
  requiredByDate?: string | null;
  externalReference?: string | null;
  projectContractRef?: string | null;
  currency?: string;
  paymentDestination?: PaymentDestinationInput | null;
};

export type UpdateDraftFinancialRequestClientInput = {
  categoryId?: string | null;
  requestedAmount?: number | null;
  purpose?: string | null;
  description?: string | null;
  payeeName?: string | null;
  payeeType?: FinancialRequestPayeeType | null;
  requiredByDate?: string | null;
  clearRequiredByDate?: boolean;
  externalReference?: string | null;
  projectContractRef?: string | null;
  paymentDestinationMutation?: PaymentDestinationMutation;
};

export type FinancialRequestProfileSummary = {
  id: string;
  fullName: string | null;
  jobTitle: string | null;
};

export type FinancialRequestCapabilities = {
  profileId: string;
  create: boolean;
  viewOwn: boolean;
  review: boolean;
  approve: boolean;
  view: boolean;
};

export type FinancialRequestDetail = {
  request: FinancialRequest;
  events: FinancialRequestEvent[];
  documents: FinancialRequestDocument[];
  requester: FinancialRequestProfileSummary | null;
};

/**
 * Browser/client boundary for Financial Requests (Slice 3).
 * Maps 1:1 to named API actions → PlatformFinanceRequestsServerService.
 */
export const PlatformFinanceRequestsService = {
  listMyRequests(): Promise<FinancialRequest[]> {
    return postAction("listMyRequests");
  },

  async listMyRequestsGet(): Promise<FinancialRequest[]> {
    const response = await fetch(API_PATH, { credentials: "same-origin" });
    const json = (await response.json()) as
      | ApiSuccess<FinancialRequest[]>
      | ApiFailure;
    if (!response.ok || !json.success) {
      throw new Error(
        ("message" in json && json.message) ||
          "Unable to list financial requests."
      );
    }
    return json.data;
  },

  listReviewQueue(): Promise<FinancialRequest[]> {
    return postAction("listReviewQueue");
  },

  listApprovalQueue(): Promise<FinancialRequest[]> {
    return postAction("listApprovalQueue");
  },

  listAccessibleRequests(): Promise<{
    requests: FinancialRequest[];
    requesters: FinancialRequestProfileSummary[];
  }> {
    return postAction("listAccessibleRequests");
  },

  listAccessibleCompanies(): Promise<
    Array<{ id: string; code: string; name: string; status: string }>
  > {
    return postAction("listAccessibleCompanies");
  },

  listCategories(): Promise<FinancialRequestCategory[]> {
    return postAction("listCategories");
  },

  getMyRequestCapabilities(): Promise<FinancialRequestCapabilities> {
    return postAction("getMyRequestCapabilities");
  },

  getRequest(requestId: string): Promise<FinancialRequest> {
    return postAction("getRequest", { id: requestId });
  },

  getRequestDetail(requestId: string): Promise<FinancialRequestDetail> {
    return postAction("getRequestDetail", { id: requestId });
  },

  createRequest(
    input: CreateFinancialRequestClientInput
  ): Promise<FinancialRequest> {
    return postAction("createRequest", { input, companyId: input.companyId });
  },

  updateDraftRequest(
    requestId: string,
    input: UpdateDraftFinancialRequestClientInput
  ): Promise<FinancialRequest> {
    return postAction("updateDraftRequest", { id: requestId, input });
  },

  submitRequest(requestId: string): Promise<FinancialRequest> {
    return postAction("submitRequest", { id: requestId });
  },

  startRequestReview(requestId: string): Promise<FinancialRequest> {
    return postAction("startRequestReview", { id: requestId });
  },

  queryRequest(
    requestId: string,
    input: { reason: string; actorRole: "finance" | "ceo" }
  ): Promise<FinancialRequest> {
    return postAction("queryRequest", { id: requestId, input });
  },

  resubmitRequest(
    requestId: string,
    input: UpdateDraftFinancialRequestClientInput = {}
  ): Promise<FinancialRequest> {
    return postAction("resubmitRequest", { id: requestId, input });
  },

  sendRequestToCeo(
    requestId: string,
    financeNotes?: string | null
  ): Promise<FinancialRequest> {
    return postAction("sendRequestToCeo", {
      id: requestId,
      input: { financeNotes: financeNotes ?? null },
    });
  },

  approveRequest(
    requestId: string,
    decisionNotes?: string | null
  ): Promise<FinancialRequest> {
    return postAction("approveRequest", {
      id: requestId,
      input: { decisionNotes: decisionNotes ?? null },
    });
  },

  partiallyApproveRequest(
    requestId: string,
    input: { approvedAmount: number; decisionNotes?: string | null }
  ): Promise<FinancialRequest> {
    return postAction("partiallyApproveRequest", { id: requestId, input });
  },

  rejectRequest(
    requestId: string,
    reason: string
  ): Promise<FinancialRequest> {
    return postAction("rejectRequest", {
      id: requestId,
      input: { reason },
    });
  },

  deleteDraftRequest(
    requestId: string
  ): Promise<{ deletedRequestId: string }> {
    return postAction("deleteDraftRequest", { id: requestId });
  },

  uploadRequestDocument(input: {
    requestId: string;
    documentRole: FinancialRequestDocument["documentRole"];
    file: File;
  }): Promise<FinancialRequestDocument> {
    const form = new FormData();
    form.set("action", "uploadRequestDocument");
    form.set("id", input.requestId);
    form.set("documentRole", input.documentRole);
    form.set("file", input.file, input.file.name);
    return postMultipart(form);
  },

  removeDraftRequestDocument(
    requestId: string,
    documentId: string
  ): Promise<{ removedDocumentId: string }> {
    return postAction("removeDraftRequestDocument", {
      id: requestId,
      input: { documentId },
    });
  },

  supersedeRequestDocument(input: {
    requestId: string;
    documentId: string;
    file: File;
    documentRole?: FinancialRequestDocument["documentRole"];
  }): Promise<{
    previous: FinancialRequestDocument;
    replacement: FinancialRequestDocument;
  }> {
    const form = new FormData();
    form.set("action", "supersedeRequestDocument");
    form.set("id", input.requestId);
    form.set("documentId", input.documentId);
    if (input.documentRole) form.set("documentRole", input.documentRole);
    form.set("file", input.file, input.file.name);
    return postMultipart(form);
  },

  getRequestDocumentSignedUrl(
    requestId: string,
    documentId: string
  ): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    return postAction("getRequestDocumentSignedUrl", {
      id: requestId,
      input: { documentId },
    });
  },
};
