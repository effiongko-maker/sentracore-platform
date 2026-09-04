/**
 * Pure Home Financial Position snapshot — reuses submission payment reconciliation.
 * Does not invent financial concepts or persistence fields.
 */

import type {
  CostRecord,
  CostSubmission,
  ReimbursementAuthorization,
  ReimbursementPayment,
} from "@/lib/operational/finance";
import { formatFinancialAmount, sumAmounts } from "./formatFinancialAmount";
import { summarizeSubmissionPayments } from "./submissionPayment";

export type FinancialPositionSnapshotInput = {
  costRecords: CostRecord[];
  totalCostRecords: number;
  submissions: CostSubmission[];
  totalSubmissions: number;
  payments: ReimbursementPayment[];
  totalPayments: number;
  authorizations: ReimbursementAuthorization[];
  totalAuthorizations?: number;
  currency?: string;
};

export type FinancialPositionSnapshot = {
  spentAmount: number;
  expectedReimbursementAmount: number;
  outstandingReimbursementAmount: number;
  currency: string;
  spentLabel: string;
  expectedLabel: string;
  outstandingLabel: string;
  /** True when any source pool is truncated relative to API totals. */
  isSample: boolean;
  costsTruncated: boolean;
  submissionsTruncated: boolean;
  paymentsTruncated: boolean;
  authorizationsTruncated: boolean;
  /** Open claims included in expected / outstanding (submitted | queried). */
  openClaimCount: number;
  costRecordsInView: number;
  costRecordsTotal: number;
};

function isOpenReimbursementClaim(
  status: CostSubmission["status"]
): boolean {
  return status === "submitted" || status === "queried";
}

export function deriveFinancialPositionSnapshot(
  input: FinancialPositionSnapshotInput
): FinancialPositionSnapshot {
  const costsTruncated = input.totalCostRecords > input.costRecords.length;
  const submissionsTruncated =
    input.totalSubmissions > input.submissions.length;
  const paymentsTruncated = input.totalPayments > input.payments.length;
  const authTotal =
    input.totalAuthorizations ?? input.authorizations.length;
  const authorizationsTruncated =
    authTotal > input.authorizations.length;

  const currency =
    input.currency ??
    input.costRecords[0]?.currency ??
    input.payments[0]?.currency ??
    input.authorizations[0]?.currency ??
    "NGN";

  const spentAmount = sumAmounts(
    input.costRecords.map((row) => ({ amount: row.actualAmount }))
  );

  let expectedReimbursementAmount = 0;
  let outstandingReimbursementAmount = 0;
  let openClaimCount = 0;

  for (const submission of input.submissions) {
    if (!isOpenReimbursementClaim(submission.status)) continue;
    openClaimCount += 1;
    const summary = summarizeSubmissionPayments(
      submission,
      input.payments,
      input.authorizations
    );
    const basis = summary.authorizedAmount ?? summary.claimAmount;
    expectedReimbursementAmount += basis;
    outstandingReimbursementAmount += summary.outstandingAmount;
  }

  const isSample =
    costsTruncated ||
    submissionsTruncated ||
    paymentsTruncated ||
    authorizationsTruncated;

  return {
    spentAmount,
    expectedReimbursementAmount,
    outstandingReimbursementAmount,
    currency,
    spentLabel: formatFinancialAmount(spentAmount, currency),
    expectedLabel: formatFinancialAmount(
      expectedReimbursementAmount,
      currency
    ),
    outstandingLabel: formatFinancialAmount(
      outstandingReimbursementAmount,
      currency
    ),
    isSample,
    costsTruncated,
    submissionsTruncated,
    paymentsTruncated,
    authorizationsTruncated,
    openClaimCount,
    costRecordsInView: input.costRecords.length,
    costRecordsTotal: input.totalCostRecords,
  };
}
