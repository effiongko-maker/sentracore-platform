import type {
  FinanceInvoice,
  FinanceInvoiceDetail,
  InvoiceAccountingPreview,
} from "@/modules/platform-finance/domain/invoices";
import type { InvoiceCapabilities, InvoiceLineInput } from "@/modules/platform-finance/server/PlatformFinanceInvoicesServerService";
import type { FinanceAccount, FinanceCompany } from "@/modules/platform-finance/types";

const API_PATH = "/api/platform-finance/invoices";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message?: string };

async function postAction<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
    credentials: "same-origin",
  });
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !json.success) {
    throw new Error(("message" in json && json.message) || `Invoice action failed (${action}).`);
  }
  return json.data;
}

export const PlatformFinanceInvoicesService = {
  getMyCapabilities(): Promise<InvoiceCapabilities> {
    return postAction("getMyInvoiceCapabilities");
  },
  listAccessibleCompanies(): Promise<FinanceCompany[]> {
    return postAction("listAccessibleCompanies");
  },
  listRevenueAccounts(): Promise<FinanceAccount[]> {
    return postAction("listRevenueAccounts");
  },
  list(): Promise<FinanceInvoice[]> {
    return postAction("listInvoices");
  },
  getDetail(id: string): Promise<FinanceInvoiceDetail> {
    return postAction("getInvoiceDetail", { id });
  },
  create(input: {
    companyId: string;
    counterpartyId: string;
    invoiceDate: string;
    dueDate: string;
    currency?: string;
    description?: string | null;
    lines: InvoiceLineInput[];
  }): Promise<FinanceInvoiceDetail> {
    return postAction("createInvoice", { input });
  },
  updateDraft(
    id: string,
    input: {
      counterpartyId?: string;
      invoiceDate?: string;
      dueDate?: string;
      currency?: string;
      description?: string | null;
      lines?: InvoiceLineInput[];
    }
  ): Promise<FinanceInvoiceDetail> {
    return postAction("updateDraftInvoice", { id, input });
  },
  submitForReview(id: string): Promise<FinanceInvoiceDetail> {
    return postAction("submitInvoiceForReview", { id });
  },
  returnToDraft(id: string): Promise<FinanceInvoiceDetail> {
    return postAction("returnInvoiceToDraft", { id });
  },
  getAccountingPreview(id: string): Promise<InvoiceAccountingPreview> {
    return postAction("getInvoiceAccountingPreview", { id });
  },
  issueAndPost(id: string): Promise<FinanceInvoiceDetail> {
    return postAction("issueAndPostInvoice", { id });
  },
  deleteDraft(id: string): Promise<{ deletedInvoiceId: string }> {
    return postAction("deleteDraftInvoice", { id });
  },
};
