/**
 * Browser/client boundary for Platform Finance Review & Post across source events.
 */
import type { AccountingReviewWorkItem, SupplierBillAccountingReview } from "@/modules/platform-finance/domain/accountingReview";

const API_PATH = "/api/platform-finance/accounting-review";

type ApiSuccess<T> = { success: true; data: T };
type ApiFailure = { success: false; message?: string; code?: string };

/** Carries the HTTP status so callers can tell RESTRICTED (403) from a genuine failure. */
export class FinanceAccountingReviewApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "FinanceAccountingReviewApiError";
  }
}

async function postAction<T>(action: string, body: Record<string, unknown> = {}): Promise<T> {
  const response = await fetch(API_PATH, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, ...body }),
    credentials: "same-origin",
  });
  const json = (await response.json()) as ApiSuccess<T> | ApiFailure;
  if (!response.ok || !json.success) {
    throw new FinanceAccountingReviewApiError(("message" in json && json.message) || `Accounting review failed (${action}).`, response.status);
  }
  return json.data;
}

export const PlatformFinanceAccountingReviewService = {
  listAccountingWork(): Promise<AccountingReviewWorkItem[]> {
    return postAction("listAccountingWork");
  },
  getSupplierBillReview(vendorBillId: string): Promise<SupplierBillAccountingReview> {
    return postAction("getSupplierBillReview", { input: { vendorBillId } });
  },
  /** Read-only accounting status (never starts a review). */
  getSupplierBillAccountingStatus(vendorBillId: string): Promise<SupplierBillAccountingReview> {
    return postAction("getSupplierBillReview", { input: { vendorBillId, startReview: false } });
  },
  postSupplierBill(vendorBillId: string, debitAccountId: string): Promise<SupplierBillAccountingReview> {
    return postAction("postSupplierBill", { input: { vendorBillId, debitAccountId } });
  },
};
