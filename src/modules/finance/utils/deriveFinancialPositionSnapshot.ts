/**
 * Pure Home Financial Position snapshot — reuses submission payment reconciliation.
 * Does not invent financial concepts or persistence fields.
 *
 * Sources may be independently unavailable. Affected metrics become null
 * rather than inventing 0 or discarding successful sibling sources.
 */

import type {
  CostRecord,
  CostSubmission,
  ReimbursementAuthorization,
  ReimbursementPayment,
} from "@/lib/operational/finance";
import { formatFinancialAmount, sumAmounts } from "./formatFinancialAmount";
import { summarizeSubmissionPayments } from "./submissionPayment";

export type FinancialPositionSourcePool<T> =
  | { available: true; data: T[]; total: number }
  | { available: false };

export type FinancialPositionSnapshotInput = {
  costs: FinancialPositionSourcePool<CostRecord>;
  submissions: FinancialPositionSourcePool<CostSubmission>;
  payments: FinancialPositionSourcePool<ReimbursementPayment>;
  authorizations: FinancialPositionSourcePool<ReimbursementAuthorization>;
  currency?: string;
};

export type FinancialPositionSnapshot = {
  /** null when the cost-records source is unavailable. */
  spentAmount: number | null;
  /** null when submissions or authorizations are unavailable. */
  expectedReimbursementAmount: number | null;
  /** null when submissions, authorizations, or payments are unavailable. */
  outstandingReimbursementAmount: number | null;
  currency: string;
  spentLabel: string | null;
  expectedLabel: string | null;
  outstandingLabel: string | null;
  /** True when any available source pool is truncated relative to API totals. */
  isSample: boolean;
  costsTruncated: boolean;
  submissionsTruncated: boolean;
  paymentsTruncated: boolean;
  authorizationsTruncated: boolean;
  costsAvailable: boolean;
  submissionsAvailable: boolean;
  paymentsAvailable: boolean;
  authorizationsAvailable: boolean;
  spentAvailable: boolean;
  expectedAvailable: boolean;
  outstandingAvailable: boolean;
  /** Open claims included in expected / outstanding (submitted | queried). */
  openClaimCount: number | null;
  costRecordsInView: number;
  costRecordsTotal: number | null;
};

function isOpenReimbursementClaim(
  status: CostSubmission["status"]
): boolean {
  return status === "submitted" || status === "queried";
}

function labelOrNull(
  available: boolean,
  amount: number | null,
  currency: string
): string | null {
  if (!available || amount == null) return null;
  return formatFinancialAmount(amount, currency);
}

export function deriveFinancialPositionSnapshot(
  input: FinancialPositionSnapshotInput
): FinancialPositionSnapshot {
  const costsAvailable = input.costs.available;
  const submissionsAvailable = input.submissions.available;
  const paymentsAvailable = input.payments.available;
  const authorizationsAvailable = input.authorizations.available;

  const costRecords = costsAvailable ? input.costs.data : [];
  const totalCostRecords = costsAvailable ? input.costs.total : 0;
  const submissions = submissionsAvailable ? input.submissions.data : [];
  const totalSubmissions = submissionsAvailable ? input.submissions.total : 0;
  const payments = paymentsAvailable ? input.payments.data : [];
  const totalPayments = paymentsAvailable ? input.payments.total : 0;
  const authorizations = authorizationsAvailable
    ? input.authorizations.data
    : [];
  const totalAuthorizations = authorizationsAvailable
    ? input.authorizations.total
    : 0;

  const costsTruncated =
    costsAvailable && totalCostRecords > costRecords.length;
  const submissionsTruncated =
    submissionsAvailable && totalSubmissions > submissions.length;
  const paymentsTruncated =
    paymentsAvailable && totalPayments > payments.length;
  const authorizationsTruncated =
    authorizationsAvailable && totalAuthorizations > authorizations.length;

  const currency =
    input.currency ??
    costRecords[0]?.currency ??
    payments[0]?.currency ??
    authorizations[0]?.currency ??
    "NGN";

  const spentAvailable = costsAvailable;
  const spentAmount = spentAvailable
    ? sumAmounts(costRecords.map((row) => ({ amount: row.actualAmount })))
    : null;

  // Expected needs open claims + authorization pool (auth ?? claim basis).
  // Outstanding also needs payments (received amounts). Missing any required
  // source → null metric (never invent 0 from an incomplete derivation).
  const expectedAvailable = submissionsAvailable && authorizationsAvailable;
  const outstandingAvailable =
    submissionsAvailable && authorizationsAvailable && paymentsAvailable;

  let expectedReimbursementAmount: number | null = null;
  let outstandingReimbursementAmount: number | null = null;
  let openClaimCount: number | null = null;

  if (expectedAvailable || outstandingAvailable) {
    let expected = 0;
    let outstanding = 0;
    let openClaims = 0;
    for (const submission of submissions) {
      if (!isOpenReimbursementClaim(submission.status)) continue;
      openClaims += 1;
      const summary = summarizeSubmissionPayments(
        submission,
        paymentsAvailable ? payments : [],
        authorizationsAvailable ? authorizations : []
      );
      const basis = summary.authorizedAmount ?? summary.claimAmount;
      expected += basis;
      outstanding += summary.outstandingAmount;
    }
    openClaimCount = openClaims;
    if (expectedAvailable) expectedReimbursementAmount = expected;
    if (outstandingAvailable) outstandingReimbursementAmount = outstanding;
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
    spentLabel: labelOrNull(spentAvailable, spentAmount, currency),
    expectedLabel: labelOrNull(
      expectedAvailable,
      expectedReimbursementAmount,
      currency
    ),
    outstandingLabel: labelOrNull(
      outstandingAvailable,
      outstandingReimbursementAmount,
      currency
    ),
    isSample,
    costsTruncated,
    submissionsTruncated,
    paymentsTruncated,
    authorizationsTruncated,
    costsAvailable,
    submissionsAvailable,
    paymentsAvailable,
    authorizationsAvailable,
    spentAvailable,
    expectedAvailable,
    outstandingAvailable,
    openClaimCount,
    costRecordsInView: costRecords.length,
    costRecordsTotal: costsAvailable ? totalCostRecords : null,
  };
}
