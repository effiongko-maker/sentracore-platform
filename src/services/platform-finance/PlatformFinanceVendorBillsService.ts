/**
 * Browser/client boundary for Platform Finance Vendor Bills.
 * Maps 1:1 to named API actions → PlatformFinanceVendorBillsServerService.
 *
 * There is no createPayable here: the Payable is minted server-side, inside the
 * CEO approval transaction. No banking, payment, or posting actions.
 */
import type {
  FinanceVendorBill,
  FinanceVendorBillDocument,
  FinanceVendorBillDocumentRole,
  FinanceVendorBillEvent,
  FinanceVendorBillPayableSummary,
  FinanceVendorBillPayeeType,
} from "@/modules/platform-finance/domain/vendorBills";

const API_PATH = "/api/platform-finance/vendor-bills";

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
      ("message" in json && json.message) || `Vendor bill failed (${action}).`
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
        "Vendor bill document upload failed."
    );
  }
  return json.data;
}

export type CreateFinanceVendorBillClientInput = {
  companyId: string;
  billedAmount: number;
  purpose: string;
  payeeName: string;
  payeeType: FinanceVendorBillPayeeType;
  description?: string | null;
  invoiceReference?: string | null;
  invoiceDate?: string | null;
  goodsServicesReceived?: boolean;
  dueDate?: string | null;
  projectContractRef?: string | null;
  currency?: string;
};

export type UpdateDraftFinanceVendorBillClientInput = {
  billedAmount?: number | null;
  purpose?: string | null;
  payeeName?: string | null;
  payeeType?: FinanceVendorBillPayeeType | null;
  description?: string | null;
  invoiceReference?: string | null;
  invoiceDate?: string | null;
  clearInvoiceDate?: boolean;
  goodsServicesReceived?: boolean | null;
  dueDate?: string | null;
  clearDueDate?: boolean;
  projectContractRef?: string | null;
  currency?: string | null;
};

export type ResubmitFinanceVendorBillClientInput =
  UpdateDraftFinanceVendorBillClientInput;

export type FinanceVendorBillProfileSummary = {
  id: string;
  fullName: string | null;
  jobTitle: string | null;
};

export type FinanceVendorBillCapabilities = {
  profileId: string;
  view: boolean;
  create: boolean;
  review: boolean;
  /** Reuses platform_finance.request.approve — there is no vendor_bill.approve. */
  approve: boolean;
  platformView: boolean;
};

export type FinanceVendorBillDetail = {
  vendorBill: FinanceVendorBill;
  events: FinanceVendorBillEvent[];
  documents: FinanceVendorBillDocument[];
  payable: FinanceVendorBillPayableSummary | null;
  inputter: FinanceVendorBillProfileSummary | null;
  actors: FinanceVendorBillProfileSummary[];
};

export const PlatformFinanceVendorBillsService = {
  listMyVendorBills(): Promise<FinanceVendorBill[]> {
    return postAction("listMyVendorBills");
  },

  async listMyVendorBillsGet(): Promise<FinanceVendorBill[]> {
    const response = await fetch(API_PATH, { credentials: "same-origin" });
    const json = (await response.json()) as
      | ApiSuccess<FinanceVendorBill[]>
      | ApiFailure;
    if (!response.ok || !json.success) {
      throw new Error(
        ("message" in json && json.message) || "Unable to list vendor bills."
      );
    }
    return json.data;
  },

  listAccessibleVendorBills(): Promise<{
    vendorBills: FinanceVendorBill[];
    inputters: FinanceVendorBillProfileSummary[];
  }> {
    return postAction("listAccessibleVendorBills");
  },

  listReviewQueue(): Promise<FinanceVendorBill[]> {
    return postAction("listReviewQueue");
  },

  listApprovalQueue(): Promise<FinanceVendorBill[]> {
    return postAction("listApprovalQueue");
  },

  listAccessibleCompanies(): Promise<
    Array<{ id: string; code: string; name: string; status: string }>
  > {
    return postAction("listAccessibleCompanies");
  },

  getMyVendorBillCapabilities(): Promise<FinanceVendorBillCapabilities> {
    return postAction("getMyVendorBillCapabilities");
  },

  getVendorBill(vendorBillId: string): Promise<FinanceVendorBill> {
    return postAction("getVendorBill", { id: vendorBillId });
  },

  getVendorBillDetail(vendorBillId: string): Promise<FinanceVendorBillDetail> {
    return postAction("getVendorBillDetail", { id: vendorBillId });
  },

  createVendorBill(
    input: CreateFinanceVendorBillClientInput
  ): Promise<FinanceVendorBill> {
    return postAction("createVendorBill", { input, companyId: input.companyId });
  },

  updateDraftVendorBill(
    vendorBillId: string,
    input: UpdateDraftFinanceVendorBillClientInput
  ): Promise<FinanceVendorBill> {
    return postAction("updateDraftVendorBill", { id: vendorBillId, input });
  },

  submitVendorBill(vendorBillId: string): Promise<FinanceVendorBill> {
    return postAction("submitVendorBill", { id: vendorBillId });
  },

  startReview(vendorBillId: string): Promise<FinanceVendorBill> {
    return postAction("startReview", { id: vendorBillId });
  },

  queryVendorBill(
    vendorBillId: string,
    reason: string,
    actorRole: "finance" | "ceo"
  ): Promise<FinanceVendorBill> {
    return postAction("queryVendorBill", {
      id: vendorBillId,
      input: { reason, actorRole },
    });
  },

  resubmitVendorBill(
    vendorBillId: string,
    input: ResubmitFinanceVendorBillClientInput = {}
  ): Promise<FinanceVendorBill> {
    return postAction("resubmitVendorBill", { id: vendorBillId, input });
  },

  sendToCeo(
    vendorBillId: string,
    financeNotes?: string | null
  ): Promise<FinanceVendorBill> {
    return postAction("sendToCeo", {
      id: vendorBillId,
      input: { financeNotes: financeNotes ?? null },
    });
  },

  /** CEO authority; the response includes the Payable created in the same TX. */
  approveVendorBill(
    vendorBillId: string,
    decisionNotes?: string | null
  ): Promise<FinanceVendorBillDetail> {
    return postAction("approveVendorBill", {
      id: vendorBillId,
      input: { decisionNotes: decisionNotes ?? null },
    });
  },

  partiallyApproveVendorBill(
    vendorBillId: string,
    approvedAmount: number,
    decisionNotes?: string | null
  ): Promise<FinanceVendorBillDetail> {
    return postAction("partiallyApproveVendorBill", {
      id: vendorBillId,
      input: { approvedAmount, decisionNotes: decisionNotes ?? null },
    });
  },

  rejectVendorBill(
    vendorBillId: string,
    reason: string
  ): Promise<FinanceVendorBill> {
    return postAction("rejectVendorBill", {
      id: vendorBillId,
      input: { reason },
    });
  },

  uploadDocument(input: {
    vendorBillId: string;
    file: File;
    documentRole: FinanceVendorBillDocumentRole;
    filename?: string;
  }): Promise<FinanceVendorBillDocument> {
    const form = new FormData();
    form.set("action", "uploadDocument");
    form.set("id", input.vendorBillId);
    form.set("file", input.file);
    form.set("documentRole", input.documentRole);
    if (input.filename) form.set("filename", input.filename);
    return postMultipart(form);
  },

  removeDocument(
    vendorBillId: string,
    documentId: string
  ): Promise<{ removedDocumentId: string }> {
    return postAction("removeDocument", {
      id: vendorBillId,
      input: { documentId },
    });
  },

  supersedeDocument(input: {
    vendorBillId: string;
    documentId: string;
    file: File;
    documentRole?: FinanceVendorBillDocumentRole;
    filename?: string;
  }): Promise<{
    previous: FinanceVendorBillDocument;
    replacement: FinanceVendorBillDocument;
  }> {
    const form = new FormData();
    form.set("action", "supersedeDocument");
    form.set("id", input.vendorBillId);
    form.set("documentId", input.documentId);
    form.set("file", input.file);
    if (input.documentRole) form.set("documentRole", input.documentRole);
    if (input.filename) form.set("filename", input.filename);
    return postMultipart(form);
  },

  getDocumentSignedUrl(
    vendorBillId: string,
    documentId: string
  ): Promise<{ signedUrl: string; expiresInSeconds: number }> {
    return postAction("getDocumentSignedUrl", {
      id: vendorBillId,
      input: { documentId },
    });
  },
};
