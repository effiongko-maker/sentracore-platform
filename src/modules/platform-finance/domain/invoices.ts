import type { FinanceAccount } from "@/modules/platform-finance/types";

export const INVOICE_STATUSES = ["draft", "under_review", "issued"] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const INVOICE_SOURCE_TYPE = "invoice";

export type FinanceInvoiceLine = {
  id: string;
  invoiceId: string;
  lineNo: number;
  description: string;
  quantity: number;
  unitPrice: number;
  lineAmount: number;
  revenueGlAccountId: string;
  revenueGlAccountCode?: string;
  revenueGlAccountName?: string;
  createdAt: string;
};

export type FinanceInvoice = {
  id: string;
  organisationId: string;
  companyId: string;
  reference: string;
  counterpartyId: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  description: string | null;
  status: InvoiceStatus;
  totalAmount: number;
  counterpartyDisplayName: string | null;
  counterpartyLegalName: string | null;
  counterpartyTaxRegistrationId: string | null;
  financeTransactionId: string | null;
  createdByProfileId: string;
  reviewedByProfileId: string | null;
  issuedByProfileId: string | null;
  reviewedAt: string | null;
  issuedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type FinanceInvoiceDetail = FinanceInvoice & {
  companyName: string;
  counterpartyName: string;
  lines: FinanceInvoiceLine[];
  journalEntryId: string | null;
};

export type InvoiceAccountingPreviewLine = {
  accountId: string;
  accountCode: string;
  accountName: string;
  debit: number;
  credit: number;
  description: string;
};

export type InvoiceAccountingPreview = {
  invoiceId: string;
  status: InvoiceStatus;
  totalAmount: number;
  currency: string;
  invoiceDate: string;
  arAccount: FinanceAccount;
  lines: InvoiceAccountingPreviewLine[];
  periodId: string | null;
  periodLabel: string | null;
};

export function roundMoney2(value: number): number {
  return Math.round(value * 100) / 100;
}

export function computeInvoiceLineAmount(quantity: number, unitPrice: number): number {
  return roundMoney2(quantity * unitPrice);
}

export function isRevenueGlEligible(account: {
  organisationId: string;
  status: string;
  accountType: string;
  code: string;
}, organisationId: string): boolean {
  const code = Number(account.code);
  return (
    account.organisationId === organisationId &&
    account.status === "active" &&
    account.accountType === "revenue" &&
    Number.isInteger(code) &&
    code >= 4000 &&
    code <= 4040
  );
}
