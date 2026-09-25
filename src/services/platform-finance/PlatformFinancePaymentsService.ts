/**
 * Browser/client boundary for Platform Finance Payments (Phase 2C).
 */
import type { FinancePaymentView } from "@/modules/platform-finance/domain/payments";
import type { FinanceFinancialAccountView } from "@/modules/platform-finance/types";
import type { PaymentAccountingReview, PaymentAccountingWorkItem } from "@/modules/platform-finance/domain/paymentAccounting";

const API_PATH = "/api/platform-finance/payments";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message?: string; code?: string };

/** Carries the HTTP status so callers can tell RESTRICTED (403) from a genuine failure. */
export class FinancePaymentApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "FinancePaymentApiError";
  }
}

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
    throw new FinancePaymentApiError(
      ("message" in json && json.message) || `Finance payment failed (${action}).`,
      response.status
    );
  }
  return json.data;
}

export type FinancePaymentCapabilities = {
  view: boolean;
  execute: boolean;
};

export type RevealedPayableDestination = {
  accountNumber: string;
  bankName: string;
  accountName: string;
  accountNumberLast4: string;
};

export const PlatformFinancePaymentsService = {
  getMyPaymentCapabilities(): Promise<FinancePaymentCapabilities> {
    return postAction("getMyPaymentCapabilities");
  },

  listPaymentsForPayable(payableId: string): Promise<FinancePaymentView[]> {
    return postAction("listPaymentsForPayable", { payableId });
  },

  listPayableSourceFinancialAccounts(
    payableId: string
  ): Promise<FinanceFinancialAccountView[]> {
    return postAction("listPayableSourceFinancialAccounts", { payableId });
  },

  confirmPayment(input: {
    payableId: string;
    sourceFinancialAccountId: string;
    amount: number;
    paymentDate: string;
    externalReference?: string | null;
  }): Promise<{ paymentId: string }> {
    return postAction("confirmPayment", {
      payableId: input.payableId,
      input: {
        sourceFinancialAccountId: input.sourceFinancialAccountId,
        amount: input.amount,
        paymentDate: input.paymentDate,
        externalReference: input.externalReference ?? null,
      },
    });
  },

  revealPayableDestination(
    payableId: string
  ): Promise<RevealedPayableDestination> {
    return postAction("revealPayableDestination", { payableId });
  },

  listPaymentAccountingWork(): Promise<PaymentAccountingWorkItem[]> {
    return postAction("listPaymentAccountingWork");
  },

  getPaymentAccountingReview(paymentId: string): Promise<PaymentAccountingReview> {
    return postAction("getPaymentAccountingReview", { input: { paymentId } });
  },

  postPaymentAccounting(paymentId: string, debitAccountId: string): Promise<PaymentAccountingReview> {
    return postAction("postPaymentAccounting", { input: { paymentId, debitAccountId } });
  },

  /** Payment settling a recognised supplier bill: Dr 2000 / Cr source control GL (no debit choice). */
  settlePaymentAccounting(paymentId: string): Promise<PaymentAccountingReview> {
    return postAction("settlePaymentAccounting", { input: { paymentId } });
  },
};
