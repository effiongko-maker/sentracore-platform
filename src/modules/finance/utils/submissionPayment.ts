/**
 * Submission ↔ authorization ↔ payment reconciliation helpers for Finance UI.
 * Authorized amount (when present) is the outstanding / fully-paid basis.
 * Payment amounts come only from persisted ReimbursementPayment records.
 */

import {
  findAuthorizationForSubmission,
} from "@/lib/operational/finance/authorization";
import {
  deriveOutstandingAmount,
  deriveReimbursementPaymentOutcome,
} from "@/lib/operational/finance/helpers";
import { sumPaymentsForSubmission } from "@/lib/operational/finance/payment";
import type {
  CostSubmission,
  ReimbursementAuthorization,
  ReimbursementPayment,
  ReimbursementPaymentOutcome,
} from "@/lib/operational/finance/types";

export type SubmissionPaymentSummary = {
  claimAmount: number;
  /** Present when a reimbursement authorization exists for the claim. */
  authorizedAmount: number | null;
  amountPaid: number;
  outstandingAmount: number;
  outcome: ReimbursementPaymentOutcome;
  paymentCount: number;
  fullyPaid: boolean;
  hasPayment: boolean;
  isAuthorized: boolean;
};

export const PAYMENT_OUTCOME_LABELS: Record<
  ReimbursementPaymentOutcome,
  string
> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  fully_paid: "Fully reimbursed",
};

export type ClaimWorkflowStatus =
  | "draft"
  | "submitted"
  | "queried"
  | "awaiting_authorization"
  | "authorized"
  | "partially_paid"
  | "fully_reimbursed"
  | "cancelled";

export const CLAIM_WORKFLOW_STATUS_LABELS: Record<ClaimWorkflowStatus, string> =
  {
    draft: "Draft",
    submitted: "Claim submitted",
    queried: "Queried",
    awaiting_authorization: "Awaiting authorization",
    authorized: "Authorized",
    partially_paid: "Partially paid",
    fully_reimbursed: "Fully reimbursed",
    cancelled: "Cancelled",
  };

export function summarizeSubmissionPayments(
  submission: Pick<CostSubmission, "submissionId" | "claimAmount" | "status">,
  payments: ReimbursementPayment[],
  authorizations: ReimbursementAuthorization[] = []
): SubmissionPaymentSummary {
  const claimAmount = submission.claimAmount ?? 0;
  const authorization = findAuthorizationForSubmission(
    authorizations,
    submission.submissionId
  );
  const authorizedAmount = authorization?.authorizedAmount ?? null;
  const linked = payments.filter(
    (payment) => payment.submissionId === submission.submissionId
  );
  const amountPaid = sumPaymentsForSubmission(linked, submission.submissionId);
  const outstanding =
    deriveOutstandingAmount({
      claimAmount,
      authorizedAmount: authorizedAmount ?? undefined,
      receivedAmount: amountPaid,
    }) ?? (authorizedAmount ?? claimAmount);
  const outcome = deriveReimbursementPaymentOutcome({
    claimAmount,
    authorizedAmount: authorizedAmount ?? undefined,
    receivedAmount: amountPaid > 0 ? amountPaid : undefined,
  });

  return {
    claimAmount,
    authorizedAmount,
    amountPaid,
    outstandingAmount: Math.max(0, outstanding),
    outcome: amountPaid > 0 ? outcome : "unpaid",
    paymentCount: linked.length,
    fullyPaid: amountPaid > 0 && outcome === "fully_paid",
    hasPayment: linked.length > 0,
    isAuthorized: authorization != null,
  };
}

export function deriveClaimWorkflowStatus(
  submission: Pick<CostSubmission, "status">,
  paymentSummary: Pick<
    SubmissionPaymentSummary,
    "isAuthorized" | "hasPayment" | "fullyPaid" | "outcome"
  >
): ClaimWorkflowStatus {
  if (submission.status === "cancelled") return "cancelled";
  if (submission.status === "draft") return "draft";
  if (submission.status === "queried") return "queried";
  if (paymentSummary.fullyPaid) return "fully_reimbursed";
  if (paymentSummary.hasPayment && paymentSummary.outcome === "partially_paid") {
    return "partially_paid";
  }
  if (paymentSummary.isAuthorized) return "authorized";
  if (submission.status === "submitted") return "awaiting_authorization";
  return "submitted";
}

export function paymentsForCostViaSubmission(
  costId: string,
  submissions: Array<Pick<CostSubmission, "submissionId" | "costRecordIds">>,
  payments: ReimbursementPayment[]
): ReimbursementPayment[] {
  const submissionIds = new Set(
    submissions
      .filter((submission) => submission.costRecordIds.includes(costId))
      .map((submission) => submission.submissionId)
  );
  return payments.filter((payment) =>
    submissionIds.has(payment.submissionId)
  );
}

/** Aggregate payment state for Finance overview (bounded payment pool). */
export type FinancePaymentOverviewState = {
  available: boolean;
  paymentCount: number;
  truncated: boolean;
  totalReceivedSample: number;
  currency: string;
  fullyPaidSubmissionCount: number | null;
  partiallyPaidSubmissionCount: number | null;
  unpaidOpenSubmissionCount: number | null;
  coverageStatus: string;
  statusSignal: string;
  positionValue: string | null;
  positionDetail: string;
};

export function buildFinancePaymentOverviewState(options: {
  submissions: CostSubmission[];
  submissionsTruncated: boolean;
  payments: ReimbursementPayment[];
  totalPayments: number;
  authorizations?: ReimbursementAuthorization[];
  currency?: string;
}): FinancePaymentOverviewState {
  const {
    submissions,
    submissionsTruncated,
    payments,
    totalPayments,
    authorizations = [],
  } = options;
  const truncated = totalPayments > payments.length;
  const currency = options.currency ?? payments[0]?.currency ?? "NGN";
  const totalReceivedSample = payments.reduce(
    (sum, payment) => sum + (payment.receivedAmount || 0),
    0
  );
  const poolSafe = !truncated && !submissionsTruncated;

  if (totalPayments === 0) {
    return {
      available: true,
      paymentCount: 0,
      truncated: false,
      totalReceivedSample: 0,
      currency,
      fullyPaidSubmissionCount: poolSafe ? 0 : null,
      partiallyPaidSubmissionCount: poolSafe ? 0 : null,
      unpaidOpenSubmissionCount: poolSafe ? 0 : null,
      coverageStatus: "Not yet recorded",
      statusSignal: "Not yet recorded",
      positionValue: null,
      positionDetail: "Not yet recorded",
    };
  }

  let fullyPaid = 0;
  let partiallyPaid = 0;
  let unpaidOpen = 0;

  for (const submission of submissions) {
    if (submission.status === "cancelled" || submission.status === "draft") {
      continue;
    }
    const summary = summarizeSubmissionPayments(
      submission,
      payments,
      authorizations
    );
    if (summary.fullyPaid) fullyPaid += 1;
    else if (summary.hasPayment) partiallyPaid += 1;
    else unpaidOpen += 1;
  }

  const coverageStatus =
    fullyPaid > 0 && partiallyPaid === 0 && unpaidOpen === 0 && poolSafe
      ? `${totalPayments} recorded · fully reimbursed in view`
      : partiallyPaid > 0 || (fullyPaid > 0 && unpaidOpen > 0)
        ? `${totalPayments} recorded · outstanding remains`
        : `${totalPayments} recorded`;

  const statusSignal =
    fullyPaid > 0 && partiallyPaid === 0 && unpaidOpen === 0 && poolSafe
      ? `${totalPayments} recorded · fully reimbursed`
      : `${totalPayments} recorded`;

  return {
    available: true,
    paymentCount: totalPayments,
    truncated,
    totalReceivedSample,
    currency,
    fullyPaidSubmissionCount: poolSafe ? fullyPaid : null,
    partiallyPaidSubmissionCount: poolSafe ? partiallyPaid : null,
    unpaidOpenSubmissionCount: poolSafe ? unpaidOpen : null,
    coverageStatus: truncated
      ? `${payments.length} newest in view · ${totalPayments} total`
      : coverageStatus,
    statusSignal: truncated ? `${payments.length} in view` : statusSignal,
    positionValue: String(totalPayments),
    positionDetail: truncated
      ? `${payments.length} newest receipts in view`
      : fullyPaid > 0 && partiallyPaid === 0 && unpaidOpen === 0
        ? "Fully reimbursed in view"
        : partiallyPaid > 0
          ? "Payment(s) recorded · outstanding remains"
          : "Payment(s) recorded",
  };
}
