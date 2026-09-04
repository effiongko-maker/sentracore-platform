/**
 * Reimbursement Authorization domain — validation and pure helpers.
 * Distinct from Work Order Approvals and from CostSubmission lifecycle status.
 */

import type { ReimbursementAuthorization } from "./types";

export const REIMBURSEMENT_AUTHORIZATION_ID_PATTERN = /^AUTH-\d{4}-\d{6}$/i;

export const DEFAULT_REIMBURSEMENT_AUTHORIZATION_CURRENCY = "NGN";

export type ReimbursementAuthorizationValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

export type ReimbursementAuthorizationValidationOptions = {
  /** When true, authorizationId may be absent (server-assigned on create). */
  serverGeneratedId?: boolean;
};

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isPositiveAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value > 0;
}

export function isValidReimbursementAuthorizationId(value: unknown): boolean {
  return (
    typeof value === "string" &&
    REIMBURSEMENT_AUTHORIZATION_ID_PATTERN.test(value)
  );
}

export function validateReimbursementAuthorization(
  authorization: Partial<ReimbursementAuthorization>,
  options: ReimbursementAuthorizationValidationOptions = {}
): ReimbursementAuthorizationValidationResult {
  const errors: string[] = [];

  if (!options.serverGeneratedId) {
    if (!isValidReimbursementAuthorizationId(authorization.authorizationId)) {
      errors.push("authorizationId must match AUTH-YYYY-NNNNNN");
    }
  }

  if (!isNonEmptyString(authorization.submissionId)) {
    errors.push("submissionId is required");
  } else if (!/^SUB-\d{4}-\d{6}$/i.test(authorization.submissionId.trim())) {
    errors.push("submissionId must match SUB-YYYY-NNNNNN");
  }

  if (!isPositiveAmount(authorization.authorizedAmount)) {
    errors.push("authorizedAmount must be a positive number");
  }

  if (!isNonEmptyString(authorization.currency)) {
    errors.push("currency is required");
  }

  if (!isNonEmptyString(authorization.authorizedAt)) {
    errors.push("authorizedAt is required");
  }

  if (!isNonEmptyString(authorization.authorizedBy)) {
    errors.push("authorizedBy is required");
  }

  if (!isNonEmptyString(authorization.recordedAt)) {
    errors.push("recordedAt is required");
  }

  if (
    authorization.authorityReference !== undefined &&
    authorization.authorityReference !== null &&
    typeof authorization.authorityReference === "string" &&
    authorization.authorityReference.length > 0 &&
    !authorization.authorityReference.trim()
  ) {
    errors.push("authorityReference must not be blank whitespace");
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}

/** Latest authorization for a submission (by authorizedAt, then recordedAt). */
export function findAuthorizationForSubmission(
  authorizations: ReimbursementAuthorization[],
  submissionId: string
): ReimbursementAuthorization | null {
  const linked = authorizations.filter(
    (row) => row.submissionId === submissionId
  );
  if (linked.length === 0) return null;
  return linked.sort((a, b) => {
    const aAt = String(a.authorizedAt || a.recordedAt || "");
    const bAt = String(b.authorizedAt || b.recordedAt || "");
    return bAt.localeCompare(aAt);
  })[0]!;
}
