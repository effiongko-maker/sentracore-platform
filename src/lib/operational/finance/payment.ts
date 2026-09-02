/**
 * Reimbursement Payment domain — validation and pure helpers.
 * Distinct from ContractPaymentRecord and from CostSubmission lifecycle.
 */

import type { ReimbursementPayment } from "./types";

export const REIMBURSEMENT_PAYMENT_ID_PATTERN = /^PAY-\d{4}-\d{6}$/i;

export const DEFAULT_REIMBURSEMENT_PAYMENT_CURRENCY = "NGN";

export type ReimbursementPaymentValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

export type ReimbursementPaymentValidationOptions = {
  /** When true, paymentId may be absent (server-assigned on create). */
  serverGeneratedId?: boolean;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isValidReimbursementPaymentId(value: unknown): boolean {
  return typeof value === "string" && REIMBURSEMENT_PAYMENT_ID_PATTERN.test(value);
}

export function validateReimbursementPayment(
  payment: Partial<ReimbursementPayment>,
  options: ReimbursementPaymentValidationOptions = {}
): ReimbursementPaymentValidationResult {
  const errors: string[] = [];

  if (!options.serverGeneratedId) {
    if (!isValidReimbursementPaymentId(payment.paymentId)) {
      errors.push("paymentId must match PAY-YYYY-NNNNNN");
    }
  }

  if (!isNonEmptyString(payment.submissionId)) {
    errors.push("submissionId is required");
  } else if (!/^SUB-\d{4}-\d{6}$/i.test(payment.submissionId.trim())) {
    errors.push("submissionId must match SUB-YYYY-NNNNNN");
  }

  if (!isNonNegativeAmount(payment.receivedAmount) || payment.receivedAmount <= 0) {
    errors.push("receivedAmount must be a positive number");
  }

  if (!isNonEmptyString(payment.currency)) {
    errors.push("currency is required");
  }

  if (!isNonEmptyString(payment.receivedAt)) {
    errors.push("receivedAt is required");
  }

  if (!isNonEmptyString(payment.recordedAt)) {
    errors.push("recordedAt is required");
  }

  if (!isNonEmptyString(payment.recordedBy)) {
    errors.push("recordedBy is required");
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/** Sum received amounts for a submission (supports multiple receipts). */
export function sumPaymentsForSubmission(
  payments: Array<Pick<ReimbursementPayment, "submissionId" | "receivedAmount">>,
  submissionId: string
): number {
  return payments
    .filter((payment) => payment.submissionId === submissionId)
    .reduce((sum, payment) => sum + (payment.receivedAmount || 0), 0);
}

export function paymentAppliesToSubmission(
  payment: Pick<ReimbursementPayment, "submissionId">,
  submissionId: string
): boolean {
  return payment.submissionId === submissionId;
}
