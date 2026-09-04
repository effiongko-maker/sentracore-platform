/**
 * Reimbursement Authorization persistence row mapping.
 * Sheet: REIMBURSEMENT_AUTHORIZATIONS — never store on CostRecord / CostSubmission status.
 */

import type { ReimbursementAuthorization } from "./types";

export const REIMBURSEMENT_AUTHORIZATION_SHEET_HEADERS = [
  "Authorization ID",
  "Submission ID",
  "Authorized Amount",
  "Currency",
  "Authorized At",
  "Authorized By",
  "Authority Reference",
  "Notes",
  "Recorded At",
] as const;

export type ReimbursementAuthorizationSheetHeader =
  (typeof REIMBURSEMENT_AUTHORIZATION_SHEET_HEADERS)[number];

export type ReimbursementAuthorizationRow = Record<
  ReimbursementAuthorizationSheetHeader,
  string | number
>;

export type RemoteReimbursementAuthorization = Record<string, unknown>;

export const FORBIDDEN_REIMBURSEMENT_AUTHORIZATION_SHEET_HEADERS = [
  "Actual Amount",
  "Claim Amount",
  "Received Amount",
  "Cost Record IDs",
  "Approval Status",
  "Submission Status",
  "Work Order ID",
  "Approval ID",
] as const;

function pickField(
  raw: RemoteReimbursementAuthorization,
  ...keys: string[]
): unknown {
  for (const key of keys) {
    const value = raw[key];
    if (value != null && String(value).trim() !== "") return value;
  }
  return undefined;
}

function optionalString(
  raw: RemoteReimbursementAuthorization,
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

export function mapRemoteReimbursementAuthorization(
  raw: RemoteReimbursementAuthorization
): ReimbursementAuthorization {
  return {
    authorizationId: String(
      pickField(raw, "authorizationId", "Authorization ID") ?? ""
    ),
    submissionId: String(
      pickField(raw, "submissionId", "Submission ID") ?? ""
    ),
    authorizedAmount: parseAmount(
      pickField(raw, "authorizedAmount", "Authorized Amount")
    ),
    currency: String(pickField(raw, "currency", "Currency") ?? "NGN"),
    authorizedAt: String(
      pickField(raw, "authorizedAt", "Authorized At") ?? ""
    ),
    authorizedBy: String(
      pickField(raw, "authorizedBy", "Authorized By") ?? ""
    ),
    authorityReference: optionalString(
      raw,
      "authorityReference",
      "Authority Reference"
    ),
    notes: optionalString(raw, "notes", "Notes"),
    recordedAt: String(pickField(raw, "recordedAt", "Recorded At") ?? ""),
  };
}

export function reimbursementAuthorizationToRemotePayload(
  authorization: Partial<ReimbursementAuthorization>
): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (authorization.authorizationId != null) {
    payload.authorizationId = authorization.authorizationId;
  }
  if (authorization.submissionId != null) {
    payload.submissionId = authorization.submissionId;
  }
  if (authorization.authorizedAmount != null) {
    payload.authorizedAmount = authorization.authorizedAmount;
  }
  if (authorization.currency != null) payload.currency = authorization.currency;
  if (authorization.authorizedAt != null) {
    payload.authorizedAt = authorization.authorizedAt;
  }
  if (authorization.authorizedBy != null) {
    payload.authorizedBy = authorization.authorizedBy;
  }
  if (authorization.authorityReference !== undefined) {
    payload.authorityReference = authorization.authorityReference;
  }
  if (authorization.notes !== undefined) payload.notes = authorization.notes;
  if (authorization.recordedAt != null) {
    payload.recordedAt = authorization.recordedAt;
  }
  return payload;
}

export function reimbursementAuthorizationToRow(
  authorization: ReimbursementAuthorization
): ReimbursementAuthorizationRow {
  return {
    "Authorization ID": authorization.authorizationId,
    "Submission ID": authorization.submissionId,
    "Authorized Amount": authorization.authorizedAmount,
    Currency: authorization.currency,
    "Authorized At": authorization.authorizedAt,
    "Authorized By": authorization.authorizedBy,
    "Authority Reference": authorization.authorityReference ?? "",
    Notes: authorization.notes ?? "",
    "Recorded At": authorization.recordedAt,
  };
}

export function rowToReimbursementAuthorization(
  row: Partial<ReimbursementAuthorizationRow> | RemoteReimbursementAuthorization
): ReimbursementAuthorization {
  return mapRemoteReimbursementAuthorization(row as RemoteReimbursementAuthorization);
}
