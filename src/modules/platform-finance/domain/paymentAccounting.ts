import type { FinanceAccount, FinancePeriod, FinanceTransaction } from "@/modules/platform-finance/types";
import type { FinancePayment } from "./payments";

export type PaymentAccountingStatus = "pending" | "draft" | "posted";

/**
 * How a confirmed Payment is accounted for — derived from the authoritative Payable source, never guessed:
 *   accrued_settlement  the Payable came from a Vendor Bill: the liability was recognised (Dr expense / Cr 2000)
 *                       by supplier-bill Review & Post, so the payment settles it: Dr 2000 / Cr cash-bank control.
 *   reviewer_debit      the Payable came from a Financial Request (no accrual exists): the reviewer chooses the
 *                       debit, as before, except that Trade Payables (2000) cannot be chosen.
 */
export type PaymentAccountingTreatment = "accrued_settlement" | "reviewer_debit";

export function paymentAccountingTreatment(payableSourceType: string): PaymentAccountingTreatment {
  return payableSourceType === "vendor_bill" ? "accrued_settlement" : "reviewer_debit";
}

export type PaymentAccountingSourceFinancialAccount =
  | {
      visibility: "visible";
      name: string;
      last4: string | null;
    }
  | {
      visibility: "restricted";
      label: "Restricted corporate financial account";
    };

export type PaymentAccountingPayment = Omit<
  FinancePayment,
  "sourceFinancialAccountId"
> & {
  sourceFinancialAccount: PaymentAccountingSourceFinancialAccount;
};

export type PaymentAccountingReview = {
  status: PaymentAccountingStatus;
  payment: PaymentAccountingPayment;
  payable: { id: string; payeeName: string; sourceType: string; sourceId: string };
  treatment: PaymentAccountingTreatment;
  /** For accrued_settlement: the supplier bill's recognition (its own accounting transaction). */
  supplierRecognition: { status: PaymentAccountingStatus; journalEntryId: string | null } | null;
  companyName: string;
  transaction: FinanceTransaction;
  debitAccount: FinanceAccount | null;
  creditAccount: FinanceAccount;
  period: FinancePeriod | null;
  /** Why posting cannot proceed right now (missing/closed period); null when it can. */
  blockingReason: string | null;
  journalEntryId: string | null;
};

export type PaymentAccountingWorkItem = {
  paymentId: string;
  payableId: string;
  companyId: string;
  payeeName: string;
  amount: number;
  currency: string;
  paymentDate: string;
  accountingStatus: PaymentAccountingStatus;
  /** Null when posting can proceed; otherwise an explicit, actionable block. */
  blockingReason: string | null;
  transactionId: string | null;
  journalEntryId: string | null;
  treatment: PaymentAccountingTreatment;
  payableSourceType: string;
  payableSourceId: string;
  sourceControlAccountId: string | null;
};

/**
 * Derived (never stored) reasons a confirmed Payment cannot be posted to the books right now.
 * Operational payment truth ("the money left") is independent of these accounting prerequisites.
 */
export type PaymentPostingPrerequisites = {
  companyId: string;
  currency: string;
  paymentDate: string;
  periods: ReadonlyArray<Pick<FinancePeriod, "companyId" | "startDate" | "endDate" | "status">>;
  sourceAccount: { status: string; companyId: string; currency: string } | null;
  controlAccount: { status: string; accountType: string; classification: string | null } | null;
};

export const PAYMENT_PERIOD_MISSING_REASON =
  "No accounting period exists for the payment date. A period covering it must be created before this payment can be posted.";
export const PAYMENT_PERIOD_CLOSED_REASON =
  "This payment falls within a closed accounting period and cannot be posted under the current accounting policy.";
export const PAYMENT_SOURCE_ACCOUNT_REASON =
  "The payment's source Financial Account is no longer valid for posting.";
export const PAYMENT_CONTROL_ACCOUNT_REASON =
  "The source Financial Account's control GL account is missing or no longer valid. Fix its configuration, then retry.";

export function paymentPeriodBlockingReason(
  periods: PaymentPostingPrerequisites["periods"],
  companyId: string,
  paymentDate: string
): string | null {
  const covering = periods.filter(
    (period) => period.companyId === companyId && period.startDate <= paymentDate && period.endDate >= paymentDate
  );
  if (covering.length === 0) return PAYMENT_PERIOD_MISSING_REASON;
  if (covering.some((period) => period.status === "open")) return null;
  return PAYMENT_PERIOD_CLOSED_REASON;
}

/** First actionable prerequisite that blocks posting, or null when Review & Post can proceed. */
export function paymentAccountingBlockingReason(input: PaymentPostingPrerequisites): string | null {
  const source = input.sourceAccount;
  if (!source || source.status !== "active" || source.companyId !== input.companyId || source.currency !== input.currency) {
    return PAYMENT_SOURCE_ACCOUNT_REASON;
  }
  const control = input.controlAccount;
  if (!control || control.status !== "active" || control.accountType !== "asset" || control.classification !== "current_asset") {
    return PAYMENT_CONTROL_ACCOUNT_REASON;
  }
  return paymentPeriodBlockingReason(input.periods, input.companyId, input.paymentDate);
}
