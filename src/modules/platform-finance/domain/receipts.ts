export type FinanceReceiptStatus = "draft" | "confirmed" | "posted";
export type FinanceReceiptAllocation = { id: string; receivableId: string; invoiceReference: string; amount: number };
export type FinanceReceipt = {
  id: string; organisationId: string; companyId: string; counterpartyId: string;
  destinationFinancialAccountId: string; reference: string; externalReference: string | null;
  receiptDate: string; currency: string; amount: number; status: FinanceReceiptStatus;
  counterpartyDisplayName: string | null; destinationAccountName: string | null;
  destinationAccountLast4: string | null; financeTransactionId: string | null;
  journalEntryId: string | null; allocations: FinanceReceiptAllocation[];
  createdAt: string; confirmedAt: string | null; postedAt: string | null;
};
export type ReceiptAccountingPreview = { receipt: FinanceReceipt; debit: { accountId: string; code: string; name: string }; credit: { accountId: string; code: string; name: string }; periodId: string | null };
