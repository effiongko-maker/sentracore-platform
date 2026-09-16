/**
 * Browser/client boundary for Platform Finance Payables (Slice 3 + Slice 4 documents).
 * Maps 1:1 to named API actions → PlatformFinancePayablesServerService.
 * No Banking/Payment/Vendor Bill domain actions.
 */
import type {
  FinancePayableDocument,
  FinancePayableDocumentRole,
  FinancePayableEvent,
  FinancePayablePayeeType,
  FinancePayableSourceRequestSummary,
  FinancePayableView,
} from "@/modules/platform-finance/domain/payables";

const API_PATH = "/api/platform-finance/payables";

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
      ("message" in json && json.message) || `Finance payable failed (${action}).`
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
        "Finance payable document upload failed."
    );
  }
  return json.data;
}

export type CreateFinancePayableClientInput = {
  companyId: string;
  payeeName: string;
  payeeType: FinancePayablePayeeType;
  payableAmount: number;
  /** Opaque vendor_bill source id — never a Financial Request id via this API. */
  sourceId: string;
  currency?: string;
  description?: string | null;
  dueDate?: string | null;
  projectContractRef?: string | null;
};

export type UpdateDraftFinancePayableClientInput = {
  payeeName?: string | null;
  payeeType?: FinancePayablePayeeType | null;
  payableAmount?: number | null;
  description?: string | null;
  dueDate?: string | null;
  clearDueDate?: boolean;
  projectContractRef?: string | null;
  currency?: string | null;
};

export type FinancePayableCapabilities = {
  profileId: string;
  view: boolean;
  create: boolean;
  review: boolean;
  approve: boolean;
  platformView: boolean;
};

export type FinancePayableDetail = {
  payable: FinancePayableView;
  events: FinancePayableEvent[];
  documents: FinancePayableDocument[];
  sourceRequest: FinancePayableSourceRequestSummary | null;
};

export const PlatformFinancePayablesService = {
  listMyPayables(): Promise<FinancePayableView[]> {
    return postAction("listMyPayables");
  },

  async listMyPayablesGet(): Promise<FinancePayableView[]> {
    const response = await fetch(API_PATH, { credentials: "same-origin" });
    const json = (await response.json()) as
      | ApiSuccess<FinancePayableView[]>
      | ApiFailure;
    if (!response.ok || !json.success) {
      throw new Error(
        ("message" in json && json.message) || "Unable to list finance payables."
      );
    }
    return json.data;
  },

  listAccessiblePayables(): Promise<FinancePayableView[]> {
    return postAction("listAccessiblePayables");
  },

  listAccessibleCompanies(): Promise<
    Array<{ id: string; code: string; name: string; status: string }>
  > {
    return postAction("listAccessibleCompanies");
  },

  getMyPayableCapabilities(): Promise<FinancePayableCapabilities> {
    return postAction("getMyPayableCapabilities");
  },

  getPayable(payableId: string): Promise<FinancePayableView> {
    return postAction("getPayable", { id: payableId });
  },

  getPayableDetail(payableId: string): Promise<FinancePayableDetail> {
    return postAction("getPayableDetail", { id: payableId });
  },

  createPayable(
    input: CreateFinancePayableClientInput
  ): Promise<FinancePayableView> {
    return postAction("createPayable", { input, companyId: input.companyId });
  },

  updateDraftPayable(
    payableId: string,
    input: UpdateDraftFinancePayableClientInput
  ): Promise<FinancePayableView> {
    return postAction("updateDraftPayable", { id: payableId, input });
  },

  submitPayable(payableId: string): Promise<FinancePayableView> {
    return postAction("submitPayable", { id: payableId });
  },

  startReview(payableId: string): Promise<FinancePayableView> {
    return postAction("startReview", { id: payableId });
  },

  approvePayable(
    payableId: string,
    decisionNotes?: string | null
  ): Promise<FinancePayableView> {
    return postAction("approvePayable", {
      id: payableId,
      input: { decisionNotes: decisionNotes ?? null },
    });
  },

  partiallyApprovePayable(
    payableId: string,
    approvedAmount: number,
    decisionNotes?: string | null
  ): Promise<FinancePayableView> {
    return postAction("partiallyApprovePayable", {
      id: payableId,
      input: { approvedAmount, decisionNotes: decisionNotes ?? null },
    });
  },

  rejectPayable(
    payableId: string,
    reason: string
  ): Promise<FinancePayableView> {
    return postAction("rejectPayable", {
      id: payableId,
      input: { reason },
    });
  },

  queryPayable(
    payableId: string,
    reason: string
  ): Promise<FinancePayableView> {
    return postAction("queryPayable", {
      id: payableId,
      input: { reason },
    });
  },

  cancelPayable(
    payableId: string,
    reason?: string | null
  ): Promise<FinancePayableView> {
    return postAction("cancelPayable", {
      id: payableId,
      input: { reason: reason ?? null },
    });
  },

  uploadDocument(input: {
    payableId: string;
    file: File;
    documentRole: FinancePayableDocumentRole;
    filename?: string;
  }): Promise<FinancePayableDocument> {
    const form = new FormData();
    form.set("action", "uploadDocument");
    form.set("id", input.payableId);
    form.set("file", input.file);
    form.set("documentRole", input.documentRole);
    if (input.filename) form.set("filename", input.filename);
    return postMultipart(form);
  },

  removeDocument(
    payableId: string,
    documentId: string
  ): Promise<{ removedDocumentId: string }> {
    return postAction("removeDocument", {
      id: payableId,
      input: { documentId },
    });
  },

  supersedeDocument(input: {
    payableId: string;
    documentId: string;
    file: File;
    documentRole?: FinancePayableDocumentRole;
    filename?: string;
  }): Promise<{
    previous: FinancePayableDocument;
    replacement: FinancePayableDocument;
  }> {
    const form = new FormData();
    form.set("action", "supersedeDocument");
    form.set("id", input.payableId);
    form.set("documentId", input.documentId);
    form.set("file", input.file);
    if (input.documentRole) form.set("documentRole", input.documentRole);
    if (input.filename) form.set("filename", input.filename);
    return postMultipart(form);
  },

  getDocumentSignedUrl(
    payableId: string,
    documentId: string
  ): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    return postAction("getDocumentSignedUrl", {
      id: payableId,
      input: { documentId },
    });
  },
};
