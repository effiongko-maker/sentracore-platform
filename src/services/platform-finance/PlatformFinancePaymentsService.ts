/**
 * Browser/client boundary for Platform Finance Payments (Phase 2C).
 */
import type { FinancePaymentView } from "@/modules/platform-finance/domain/payments";
import type { FinanceFinancialAccountView } from "@/modules/platform-finance/types";

const API_PATH = "/api/platform-finance/payments";

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
      ("message" in json && json.message) || `Finance payment failed (${action}).`
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
};
