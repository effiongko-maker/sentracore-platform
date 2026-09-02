/**
 * Reimbursement Payment persistence row mapping.
 * Sheet: REIMBURSEMENT_PAYMENTS — never store these fields on CostRecord/CostSubmission.
 */

import type { ReimbursementPayment } from "./types";

export const REIMBURSEMENT_PAYMENT_SHEET_HEADERS = [
  "Payment ID",
  "Submission ID",
  "Received Amount",
  "Currency",
  "Received At",
  "Reference",
  "Method",
  "Evidence Reference",
  "Notes",
  "Recorded At",
  "Recorded By",
] as const;

export type ReimbursementPaymentSheetHeader =
  (typeof REIMBURSEMENT_PAYMENT_SHEET_HEADERS)[number];

export type ReimbursementPaymentRow = Record<
  ReimbursementPaymentSheetHeader,
  string | number
>;

export type RemoteReimbursementPayment = Record<string, unknown>;

/** Fields that must never appear on the reimbursement payment sheet. */
export const FORBIDDEN_REIMBURSEMENT_PAYMENT_SHEET_HEADERS = [
  "Actual Amount",
  "Claim Amount",
  "Markup Amount",
  "Cost Record IDs",
  "Approval Status",
  "Submission Status",
  "Reimbursability",
] as const;

function pickField(raw: RemoteReimbursementPayment, ...keys: string[]): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function optionalString(
  raw: RemoteReimbursementPayment,
  ...keys: string[]
): string | undefined {
  const value = pickField(raw, ...keys);
  if (value == null) return undefined;
  const text = String(value).trim();
  return text || undefined;
}

function parseAmount(value: unknown): number {
  const amount = Number(value);
  return Number.isFinite(amount) ? amount : 0;
}

export function mapRemoteReimbursementPayment(
  raw: RemoteReimbursementPayment
): ReimbursementPayment {
  return {
    paymentId: String(pickField(raw, "paymentId", "Payment ID") ?? ""),
    submissionId: String(pickField(raw, "submissionId", "Submission ID") ?? ""),
    receivedAmount: parseAmount(
      pickField(raw, "receivedAmount", "Received Amount")
    ),
    currency: String(pickField(raw, "currency", "Currency") ?? "NGN"),
    receivedAt: String(pickField(raw, "receivedAt", "Received At") ?? ""),
    reference: optionalString(raw, "reference", "Reference"),
    method: optionalString(raw, "method", "Method"),
    evidenceReference: optionalString(
      raw,
      "evidenceReference",
      "Evidence Reference"
    ),
    notes: optionalString(raw, "notes", "Notes"),
    recordedAt: String(pickField(raw, "recordedAt", "Recorded At") ?? ""),
    recordedBy: String(pickField(raw, "recordedBy", "Recorded By") ?? ""),
  };
}

export function reimbursementPaymentToRemotePayload(
  payment: Partial<ReimbursementPayment>
): RemoteReimbursementPayment {
  return { ...payment };
}

export function reimbursementPaymentToRow(
  payment: ReimbursementPayment
): ReimbursementPaymentRow {
  return {
    "Payment ID": payment.paymentId,
    "Submission ID": payment.submissionId,
    "Received Amount": payment.receivedAmount,
    Currency: payment.currency,
    "Received At": payment.receivedAt,
    Reference: payment.reference ?? "",
    Method: payment.method ?? "",
    "Evidence Reference": payment.evidenceReference ?? "",
    Notes: payment.notes ?? "",
    "Recorded At": payment.recordedAt,
    "Recorded By": payment.recordedBy,
  };
}

export function rowToReimbursementPayment(
  row: Partial<ReimbursementPaymentRow>
): ReimbursementPayment {
  return mapRemoteReimbursementPayment({
    paymentId: row["Payment ID"],
    submissionId: row["Submission ID"],
    receivedAmount: row["Received Amount"],
    currency: row["Currency"],
    receivedAt: row["Received At"],
    reference: row["Reference"],
    method: row["Method"],
    evidenceReference: row["Evidence Reference"],
    notes: row["Notes"],
    recordedAt: row["Recorded At"],
    recordedBy: row["Recorded By"],
  });
}
