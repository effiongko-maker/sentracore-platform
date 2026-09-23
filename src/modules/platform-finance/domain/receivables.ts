/** invoice = derived from an issued SentraCore™ invoice. The others are live client billing made outside SentraCore™. */
export type FinanceReceivableOrigin = "invoice" | "client_request" | "contract_instalment";

export type FinanceReceivable = {
  id: string;
  organisationId: string;
  companyId: string;
  companyName: string;
  originType: FinanceReceivableOrigin;
  /** Off-ledger: no GL recognition exists (non-invoice origins). Settlement counts confirmed receipts. */
  offLedger: boolean;
  /** Invoice origin only. */
  invoiceId: string | null;
  counterpartyId: string;
  /** Invoice origin only. */
  invoiceReference: string | null;
  /** Invoice origin only. */
  invoiceDate: string | null;
  /** null when the source states no due date (never inferred). */
  dueDate: string | null;
  /** Non-invoice origin: the source's own invoice/request number, verbatim. */
  clientReference: string | null;
  /** Non-invoice origin: date the request was submitted to the client. */
  submittedOn: string | null;
  description: string | null;
  /** Non-invoice origin: the client's processing point as the source states it. */
  sourceLocation: string | null;
  /** Non-invoice origin: latest source update/note, verbatim. */
  sourceUpdate: string | null;
  /** Linked immutable historical commercial fact (display code), when one evidences the same obligation. */
  historicalFactCode: string | null;
  currency: string;
  originalAmount: number;
  outstandingAmount: number;
  availableToAllocate: number;
  counterpartyDisplayName: string;
  counterpartyLegalName: string | null;
  counterpartyTaxRegistrationId: string | null;
  financeTransactionId: string | null;
  journalEntryId: string | null;
  createdAt: string;
  status: "open" | "overdue" | "partially_settled" | "settled";
};

/** Display reference: the SentraCore™ invoice reference, or the source's own reference for non-invoice origins. */
export function receivableReference(row: Pick<FinanceReceivable, "invoiceReference" | "clientReference">): string {
  return row.invoiceReference ?? row.clientReference ?? "—";
}

export function receivableStatus(dueDate: string | null, today = new Date()): "open" | "overdue" {
  if (!dueDate) return "open";
  const todayIso = today.toISOString().slice(0, 10);
  return dueDate < todayIso ? "overdue" : "open";
}
