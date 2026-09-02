/**
 * Submission ↔ payment reconciliation helpers for Finance UI.
 * Payment amounts come only from persisted ReimbursementPayment records.
 */

import {
  deriveOutstandingAmount,
  deriveReimbursementPaymentOutcome,
} from "@/lib/operational/finance/helpers";
import { sumPaymentsForSubmission } from "@/lib/operational/finance/payment";
import type {
  CostSubmission,
  ReimbursementPayment,
  ReimbursementPaymentOutcome,
} from "@/lib/operational/finance/types";

export type SubmissionPaymentSummary = {
  claimAmount: number;
  amountPaid: number;
  outstandingAmount: number;
  outcome: ReimbursementPaymentOutcome;
  paymentCount: number;
  /** True when at least one payment exists and outcome is fully_paid. */
  fullyPaid: boolean;
  /** True when any payment has been recorded for this submission. */
  hasPayment: boolean;
};

export const PAYMENT_OUTCOME_LABELS: Record<
  ReimbursementPaymentOutcome,
  string
> = {
  unpaid: "Unpaid",
  partially_paid: "Partially paid",
  fully_paid: "Fully paid",
};

export function summarizeSubmissionPayments(
  submission: Pick<CostSubmission, "submissionId" | "claimAmount">,
  payments: ReimbursementPayment[]
): SubmissionPaymentSummary {
  const claimAmount = submission.claimAmount ?? 0;
  const linked = payments.filter(
    (payment) => payment.submissionId === submission.submissionId
  );
  const amountPaid = sumPaymentsForSubmission(linked, submission.submissionId);
  const outstanding =
    deriveOutstandingAmount({
      claimAmount,
      receivedAmount: amountPaid,
    }) ?? claimAmount;
  const outcome = deriveReimbursementPaymentOutcome({
    claimAmount,
    receivedAmount: amountPaid > 0 ? amountPaid : undefined,
  });

  return {
    claimAmount,
    amountPaid,
    outstandingAmount: Math.max(0, outstanding),
    outcome: amountPaid > 0 ? outcome : "unpaid",
    paymentCount: linked.length,
    fullyPaid: amountPaid > 0 && outcome === "fully_paid",
    hasPayment: linked.length > 0,
  };
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
  /** Capability is live (reimbursement payments resource). */
  available: boolean;
  paymentCount: number;
  truncated: boolean;
  totalReceivedSample: number;
  currency: string;
  /** Null when payment or submission pools are truncated. */
  fullyPaidSubmissionCount: number | null;
  partiallyPaidSubmissionCount: number | null;
  /** Submitted/queried claims with no payment yet (pool-safe only). */
  unpaidOpenSubmissionCount: number | null;
  /** Coverage / rail copy. */
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
  currency?: string;
}): FinancePaymentOverviewState {
  const { submissions, submissionsTruncated, payments, totalPayments } =
    options;
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
    const summary = summarizeSubmissionPayments(submission, payments);
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
      ? `${totalPayments} recorded · fully paid`
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
        ? "Fully paid in view"
        : partiallyPaid > 0
          ? "Payment(s) recorded · outstanding remains"
          : "Payment(s) recorded",
  };
}
