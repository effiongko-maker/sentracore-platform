/**
 * CostSubmission domain — validation and pure helpers.
 * No I/O, no persistence, no automatic claim logic, no markup policy.
 */

import { getAuthoritativeAmount } from "./costRecord";
import type {
  CostRecord,
  CostSubmission,
  CostSubmissionLifecycleStatus,
  CostSubmissionPackage,
  FinancialCurrencyCode,
  MarkupRepresentation,
} from "./types";

/** Canonical submission lifecycle values. */
export const COST_SUBMISSION_LIFECYCLE_STATUSES = [
  "draft",
  "submitted",
  "queried",
  "cancelled",
] as const;

/** Intended business identity format — persistence owns generation. */
export const COST_SUBMISSION_ID_PATTERN = /^SUB-\d{4}-\d{6}$/;

const LIFECYCLE_SET = new Set<string>(COST_SUBMISSION_LIFECYCLE_STATUSES);

/** Hard-coded markup policy rates must never appear in domain source. */
export const FORBIDDEN_MARKUP_RATE_LITERALS = [
  "0.30",
  "0.20",
  "0.10",
  "0.12",
  "0.15",
  "30%",
  "20%",
  "10%",
  "12%",
  "15%",
  "NCC 30",
  "PayChex",
] as const;

export type CostSubmissionValidationResult =
  | { valid: true }
  | { valid: false; errors: string[] };

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNonNegativeAmount(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

export function isValidCostSubmissionLifecycleStatus(
  status: unknown
): status is CostSubmissionLifecycleStatus {
  return typeof status === "string" && LIFECYCLE_SET.has(status);
}

export function isValidCostSubmissionId(submissionId: unknown): boolean {
  return (
    typeof submissionId === "string" && COST_SUBMISSION_ID_PATTERN.test(submissionId)
  );
}

/**
 * Resolve explicit CostRecord references, including deprecated single `costRecordId`.
 * Does not verify CostRecord existence.
 */
export function getSubmissionCostRecordIds(
  submission: Pick<CostSubmission, "costRecordIds"> & { costRecordId?: string }
): string[] {
  const ids = submission.costRecordIds ?? [];
  if (ids.length > 0) {
    return ids.map((id) => id.trim()).filter(Boolean);
  }
  const legacy = submission.costRecordId?.trim();
  return legacy ? [legacy] : [];
}

export function getSubmissionCostCount(
  submission: Pick<CostSubmission, "costRecordIds"> & { costRecordId?: string }
): number {
  return getSubmissionCostRecordIds(submission).length;
}

export function isCostSubmissionDraft(
  submission: Pick<CostSubmission, "status">
): boolean {
  return submission.status === "draft";
}

export function isCostSubmissionSubmitted(
  submission: Pick<CostSubmission, "status">
): boolean {
  return submission.status === "submitted";
}

/** Queried / returned for clarification — may be resubmitted. */
export function isCostSubmissionQueried(
  submission: Pick<CostSubmission, "status">
): boolean {
  return submission.status === "queried";
}

/** @alias isCostSubmissionQueried */
export const isCostSubmissionReturned = isCostSubmissionQueried;

export function isCostSubmissionCancelled(
  submission: Pick<CostSubmission, "status">
): boolean {
  return submission.status === "cancelled";
}

/**
 * Whether a submission may transition to submitted (including resubmit after query).
 * Does not perform the transition — explicit business action only.
 */
export function canSubmitCostSubmission(
  submission: Pick<CostSubmission, "status">
): boolean {
  return submission.status === "draft" || submission.status === "queried";
}

/**
 * Total underlying actual cost from referenced CostRecords.
 * Authoritative amounts come from CostRecord — not from CostSubmission fields.
 */
export function getSubmissionActualCostTotal(costRecords: CostRecord[]): number {
  return costRecords.reduce(
    (sum, record) => sum + getAuthoritativeAmount(record),
    0
  );
}

/**
 * Claim-side amount on the submission package when explicitly set.
 * Does not infer from CostRecords or reimbursability.
 */
export function getSubmissionClaimAmount(
  submission: Pick<CostSubmission, "claimAmount">
): number | undefined {
  return submission.claimAmount;
}

/**
 * Assert claim-side and underlying amounts remain independently representable.
 * Does not enforce a markup formula.
 */
export function assertDistinctClaimAmounts(options: {
  underlyingActualTotal: number;
  claimAmount: number;
  markup?: MarkupRepresentation;
}): void {
  if (
    typeof options.underlyingActualTotal !== "number" ||
    typeof options.claimAmount !== "number"
  ) {
    throw new Error(
      "underlyingActualTotal and claimAmount must both be numbers"
    );
  }
  void options.markup;
}

export function isCostSubmissionPackagePresent(
  pkg: CostSubmissionPackage | undefined | null
): boolean {
  if (!pkg) return false;
  return Boolean(
    pkg.reference?.trim() ||
      pkg.packageType?.trim() ||
      pkg.packageDate?.trim() ||
      pkg.notes?.trim()
  );
}

/** Default operational currency for draft submissions. */
export const DEFAULT_COST_SUBMISSION_CURRENCY: FinancialCurrencyCode = "NGN";

/**
 * Pure domain validation for CostSubmission shape and invariants.
 * Does not verify CostRecord / Facility / Approval / Payment existence.
 */
export function validateCostSubmission(
  submission: Partial<CostSubmission>
): CostSubmissionValidationResult {
  const errors: string[] = [];

  const submissionId = submission.submissionId ?? submission.id;
  if (!isNonEmptyString(submissionId)) {
    errors.push("submissionId is required");
  } else if (!isValidCostSubmissionId(submissionId)) {
    errors.push("submissionId must match SUB-YYYY-NNNNNN format");
  }

  if (!isValidCostSubmissionLifecycleStatus(submission.status)) {
    errors.push(
      "status must be draft, submitted, queried, or cancelled"
    );
  }

  if (!isNonEmptyString(submission.createdAt)) {
    errors.push("createdAt is required");
  }
  if (!isNonEmptyString(submission.createdBy)) {
    errors.push("createdBy is required");
  }
  if (!isNonEmptyString(submission.currency)) {
    errors.push("currency is required");
  }

  const costRecordIds = getSubmissionCostRecordIds({
    costRecordIds: submission.costRecordIds ?? [],
    costRecordId: submission.costRecordId,
  });

  const requiresCosts =
    submission.status === "submitted" || submission.status === "queried";
  if (requiresCosts && costRecordIds.length === 0) {
    errors.push(
      "at least one CostRecord reference is required when status is submitted or queried"
    );
  }

  for (const costId of costRecordIds) {
    if (!isNonEmptyString(costId)) {
      errors.push("costRecordIds must contain non-empty CostRecord ids");
      break;
    }
  }

  if (
    submission.claimAmount !== undefined &&
    !isNonNegativeAmount(submission.claimAmount)
  ) {
    errors.push("claimAmount must be a non-negative number when supplied");
  }

  if (submission.markup) {
    const { markupAmount, markupRatePercent } = submission.markup;
    if (
      markupAmount !== undefined &&
      !isNonNegativeAmount(markupAmount)
    ) {
      errors.push("markup.markupAmount must be non-negative when supplied");
    }
    if (
      markupRatePercent !== undefined &&
      !isNonNegativeAmount(markupRatePercent)
    ) {
      errors.push("markup.markupRatePercent must be non-negative when supplied");
    }
  }

  if (
    submission.status === "submitted" ||
    submission.status === "queried"
  ) {
    if (!isNonEmptyString(submission.submittedAt)) {
      errors.push("submittedAt is required when status is submitted or queried");
    }
    if (!isNonEmptyString(submission.submittedBy)) {
      errors.push("submittedBy is required when status is submitted or queried");
    }
  }

  if (submission.status === "queried" && !isNonEmptyString(submission.queriedAt)) {
    errors.push("queriedAt is required when status is queried");
  }

  const optionalIdFields: Array<[string, unknown]> = [
    ["facilityId", submission.facilityId],
    ["departmentId", submission.departmentId],
    ["approvalId", submission.approvalId],
    ["executionId", submission.executionId],
  ];
  for (const [field, value] of optionalIdFields) {
    if (value !== undefined && !isNonEmptyString(value)) {
      errors.push(`${field} must be a non-empty string when supplied`);
    }
  }

  return errors.length === 0 ? { valid: true } : { valid: false, errors };
}
