export type FinanceReceivable = {
  id: string;
  organisationId: string;
  companyId: string;
  companyName: string;
  invoiceId: string;
  counterpartyId: string;
  invoiceReference: string;
  invoiceDate: string;
  dueDate: string;
  currency: string;
  originalAmount: number;
  outstandingAmount: number;
  availableToAllocate: number;
  counterpartyDisplayName: string;
  counterpartyLegalName: string | null;
  counterpartyTaxRegistrationId: string | null;
  financeTransactionId: string;
  journalEntryId: string;
  createdAt: string;
  status: "open" | "overdue" | "partially_settled" | "settled";
};

export function receivableStatus(dueDate: string, today = new Date()): "open" | "overdue" {
  const todayIso = today.toISOString().slice(0, 10);
  return dueDate < todayIso ? "overdue" : "open";
}
