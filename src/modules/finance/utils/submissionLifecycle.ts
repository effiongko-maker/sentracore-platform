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
      return "Being prepared — costs and claim can still be edited.";
    case "submitted":
      return "Sent for reimbursement consideration.";
    case "queried":
      return "Returned for clarification — review the query and update before resubmitting.";
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

export function canRecordPaymentForSubmission(
  status: CostSubmissionLifecycleStatus
): boolean {
  return status === "submitted" || status === "queried";
}
