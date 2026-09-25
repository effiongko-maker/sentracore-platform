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

/** Calendar year of an ISO timestamp in WAT (Africa/Lagos, UTC+1, no DST); null when not a valid date. */
function watYear(iso?: string): number | null {
  const ms = Date.parse(iso ?? "");
  return Number.isFinite(ms) ? new Date(ms + 60 * 60 * 1000).getUTCFullYear() : null;
}

export type FinancialPositionSnapshotInput = {
  costs: FinancialPositionSourcePool<CostRecord>;
  submissions: FinancialPositionSourcePool<CostSubmission>;
  payments: FinancialPositionSourcePool<ReimbursementPayment>;
  authorizations: FinancialPositionSourcePool<ReimbursementAuthorization>;
  /**
   * The authoritative total over the COMPLETE cost register (never a bounded pool) —
   * same source Costs & Claims itself prefers. When present, Spent uses this exact
   * figure instead of summing the bounded preview pool, so Home never presents a
   * partial in-view total as if it were the whole register.
   */
  costTotals?: { totalAmount: number; currency: string; orderValueAmount?: number } | null;
  /**
   * When set, `costTotals` is that operating year's complete-register total and Spent is ONLY that figure:
   * if it failed to load, Spent is unavailable — never the bounded all-year pool (which would mix years).
   */
  operatingYear?: number;
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
  /**
   * The operating year's WO/JO execution cost from the imported order registers — already included in spend. null when the
   * year total could not be loaded.
   */
  orderValueAmount: number | null;
  orderValueLabel: string | null;
  expectedLabel: string | null;
  outstandingLabel: string | null;
  /** True when any available source pool is truncated relative to API totals. */
  isSample: boolean;
  /** True when spentAmount is the authoritative complete-register total, not a bounded-pool sum. */
  spentComplete: boolean;
  /** Operating year the snapshot presents (Spent scoped to it), when year-scoped. */
  operatingYear: number | null;
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
    input.costTotals?.currency ??
    costRecords[0]?.currency ??
    payments[0]?.currency ??
    authorizations[0]?.currency ??
    "NGN";

  // The complete register total (Costs & Claims' own authoritative source) is preferred
  // whenever it loaded successfully. The bounded preview pool is only a best-effort
  // fallback — e.g. the complete-total request itself failed — and is never presented
  // as the full register without the (sample) qualification below.
  const spentComplete = input.costTotals != null;
  const poolFallbackAllowed = input.operatingYear == null;
  const spentAvailable = spentComplete || (poolFallbackAllowed && costsAvailable);
  const spentAmount = spentComplete
    ? input.costTotals!.totalAmount
    : poolFallbackAllowed && costsAvailable
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
      // Year-scoped snapshot: a claim belongs to the year of its own submission (WAT), never another year's.
      if (
        input.operatingYear != null &&
        watYear(submission.submittedAt ?? submission.createdAt) !== input.operatingYear
      ) {
        continue;
      }
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
    orderValueAmount: input.costTotals?.orderValueAmount ?? null,
    orderValueLabel: labelOrNull(
      input.costTotals?.orderValueAmount != null,
      input.costTotals?.orderValueAmount ?? null,
      currency
    ),
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
    spentComplete,
    operatingYear: input.operatingYear ?? null,
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
