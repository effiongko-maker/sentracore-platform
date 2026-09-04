import type { CostSubmissionLifecycleStatus } from "@/lib/operational/finance/types";
import {
  assertCostSubmissionTransition,
  canQueryCostSubmission,
  canSubmitCostSubmission,
  canTransitionCostSubmission,
} from "@/lib/operational/finance/costSubmission";

export const SUBMISSION_LIFECYCLE_LABELS: Record<
  CostSubmissionLifecycleStatus,
  string
> = {
  draft: "Draft",
  submitted: "Submitted",
  queried: "Queried",
  cancelled: "Cancelled",
};

export function submissionLifecycleDescription(
  status: CostSubmissionLifecycleStatus
): string {
  switch (status) {
    case "draft":
      return "Still being prepared — you can edit costs and the claim amount.";
    case "submitted":
      return "Claim submitted — awaiting reimbursement authorization, then payment.";
    case "queried":
      return "Returned for clarification — update the claim, then resubmit.";
    case "cancelled":
      return "Withdrawn.";
    default:
      return "";
  }
}

export function canEditSubmission(
  status: CostSubmissionLifecycleStatus
): boolean {
  return status === "draft" || status === "queried";
}

export function canTransitionSubmission(
  from: CostSubmissionLifecycleStatus,
  to: CostSubmissionLifecycleStatus
): boolean {
  return canTransitionCostSubmission(from, to);
}

export function assertSubmissionTransition(
  from: CostSubmissionLifecycleStatus,
  to: CostSubmissionLifecycleStatus
): void {
  assertCostSubmissionTransition(from, to);
}

export function canSubmitSubmission(
  status: CostSubmissionLifecycleStatus
): boolean {
  return canSubmitCostSubmission({ status });
}

export function canQuerySubmission(
  status: CostSubmissionLifecycleStatus
): boolean {
  return canQueryCostSubmission({ status });
}

/** Reimbursement authorization — only submitted claims; not WO Approvals. */
export function canAuthorizeSubmission(
  status: CostSubmissionLifecycleStatus,
  isAuthorized: boolean
): boolean {
  return status === "submitted" && !isAuthorized;
}

export function canReviseAuthorization(
  status: CostSubmissionLifecycleStatus,
  isAuthorized: boolean
): boolean {
  return status === "submitted" && isAuthorized;
}

/** Payment receipts require an existing reimbursement authorization. */
export function canRecordPaymentForSubmission(
  status: CostSubmissionLifecycleStatus,
  isAuthorized: boolean
): boolean {
  return (
    (status === "submitted" || status === "queried") && isAuthorized
  );
}

/**
 * Receipt correction uses the same updatePayment gate as create
 * (submitted | queried, and authorized). Unlike Record payment, the UI still
 * offers this when the claim is already fully reimbursed.
 */
export function canCorrectPaymentForSubmission(
  status: CostSubmissionLifecycleStatus,
  isAuthorized: boolean
): boolean {
  return canRecordPaymentForSubmission(status, isAuthorized);
}
