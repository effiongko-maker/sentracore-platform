/**
 * Payments — confirmed external corporate disbursements against Payables.
 * Distinct from Payables (obligations), Journals (accounting), Receipts/Transfers.
 */

export const FINANCE_PAYMENT_STATUSES = ["confirmed"] as const;

export type FinancePaymentStatus = (typeof FINANCE_PAYMENT_STATUSES)[number];

export const FINANCE_PAYMENT_CAPABILITIES = {
  view: "platform_finance.payment.view",
  execute: "platform_finance.payment.execute",
} as const;

export type FinancePaymentCapability =
  (typeof FINANCE_PAYMENT_CAPABILITIES)[keyof typeof FINANCE_PAYMENT_CAPABILITIES];

export const FINANCE_PAYMENT_INVARIANTS = {
  payableIsNotPayment: true,
  paymentIsNotJournal: true,
  onePaymentOneDisbursement: true,
  companyMustMatchPayable: true,
  currencyMustMatchPayableAndSourceAccount: true,
  sourceAccountMustBeActiveUsable: true,
  noFinancialAccountBalanceMutation: true,
  noJournalPostingInPhase2C: true,
  destinationRemainsOnPayableSnapshot: true,
} as const;

export type FinancePayment = {
  id: string;
  organisationId: string;
  companyId: string;
  payableId: string;
  sourceFinancialAccountId: string;
  amount: number;
  currency: string;
  paymentDate: string;
  externalReference: string | null;
  status: FinancePaymentStatus;
  recordedByProfileId: string;
  createdAt: string;
  updatedAt: string;
};

export type FinancePaymentView = FinancePayment & {
  sourceFinancialAccountName: string | null;
  sourceFinancialAccountLast4: string | null;
  accountingStatus: "awaiting_accounting" | "posted";
  journalEntryId: string | null;
};

export type ConfirmFinancePaymentInput = {
  payableId: string;
  sourceFinancialAccountId: string;
  amount: number;
  paymentDate: string;
  externalReference?: string | null;
};

export function isFinancePaymentStatus(
  value: unknown
): value is FinancePaymentStatus {
  return (
    typeof value === "string" &&
    (FINANCE_PAYMENT_STATUSES as readonly string[]).includes(value)
  );
}
