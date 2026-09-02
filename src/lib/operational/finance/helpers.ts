/**
 * Pure helpers for the Phase 12 financial domain contract.
 * No I/O, no persistence, no calculation policy beyond arithmetic identity.
 */

import type {
  ContractPaymentRecord,
  CostRecord,
  CostSubmission,
  MarkupRepresentation,
  ReimbursementPaymentOutcome,
  ReimbursementPaymentReconciliation,
} from "./types";

/** Financial state must never resolve an Issue (and vice versa). */
export const FINANCIAL_OPERATIONAL_COUPLING = {
  financialStateResolvesIssue: false,
  issueResolutionImpliesPaymentReceived: false,
  operationalStatusIsReimbursementStatus: false,
} as const;

export const FINANCIAL_DOMAIN_IMPLEMENTED = {
  costRecords: true,
  costSubmissions: true,
  contractPayments: false,
  ui: true,
  /** Reimbursement payment receipts against CostSubmission (REIMBURSEMENT_PAYMENTS). */
  paymentProcessing: true,
  approvalWorkflows: false,
  jobOrder: false,
} as const;

export const COST_SUBMISSION_FLOW = [
  "actual_cost",
  "markup",
  "submitted_amount",
  "approval_submission",
  "payment_received",
] as const;

export const FINANCIAL_OPEN_DECISIONS = [
  "exact_reimbursement_categories",
  "markup_calculation_rules",
  "approved_amount_semantics",
  "approval_authority_for_submissions",
  "payment_evidence_requirements",
  "contract_payment_schedule_and_amount",
  "exact_entity_and_persistence_naming",
  "non_reimbursable_budgeting_variance_tracking",
  "finance_integration_with_beacon_or_accounting",
  "whether_client_ncc_apr_participates_in_reimbursement",
] as const;

/** @deprecated Prefer FINANCIAL_OPEN_DECISIONS */
export const COST_SUBMISSION_OPEN_DECISIONS = [
  "Entity name and persistence store for cost submissions",
  "Markup calculation rules",
  "Which authority roles unlock submission vs payment",
  "Whether Client/NCC APR participates in reimbursement vs internal only",
] as const;

/**
 * Assert commercial amounts remain independently representable.
 * Does not enforce a markup formula — only that fields are not collapsed.
 *
 * @deprecated Prefer assertDistinctClaimAmounts from costSubmission.ts
 */
export function assertDistinctCommercialAmounts(submission: {
  underlyingActualTotal?: number;
  actualAmount?: number;
  claimAmount?: number;
  submittedAmount?: number;
  markup?: MarkupRepresentation;
  approvedAmount?: number;
  receivedAmount?: number;
}): void {
  const claim =
    submission.claimAmount ?? submission.submittedAmount;
  const underlying =
    submission.underlyingActualTotal ?? submission.actualAmount;
  if (typeof claim !== "number" || typeof underlying !== "number") {
    throw new Error(
      "claim and underlying actual totals must both be numbers"
    );
  }
  void submission.markup;
  void submission.approvedAmount;
  void submission.receivedAmount;
}

/**
 * Conceptual outstanding = basis − received (when received known).
 * Prefer authorizedAmount from Approval when present; else claimAmount.
 * Does not invent payment transactions.
 */
export function deriveOutstandingAmount(options: {
  claimAmount?: number;
  submittedAmount?: number;
  authorizedAmount?: number;
  approvedAmount?: number;
  receivedAmount?: number;
}): number | undefined {
  if (options.receivedAmount === undefined) return undefined;
  const claim = options.claimAmount ?? options.submittedAmount;
  if (claim === undefined) return undefined;
  const basis =
    options.authorizedAmount ??
    options.approvedAmount ??
    claim;
  return basis - options.receivedAmount;
}

export function deriveReimbursementPaymentOutcome(
  reconciliation: ReimbursementPaymentReconciliation
): ReimbursementPaymentOutcome {
  const received = reconciliation.receivedAmount ?? 0;
  if (received <= 0) return "unpaid";
  const basis =
    reconciliation.authorizedAmount !== undefined
      ? reconciliation.authorizedAmount
      : reconciliation.claimAmount;
  if (received >= basis) return "fully_paid";
  return "partially_paid";
}

/** @deprecated Pass ReimbursementPaymentReconciliation instead of CostSubmission. */
export function deriveReimbursementPaymentOutcomeFromSubmission(
  submission: Pick<
    CostSubmission,
    "claimAmount"
  > & {
    submittedAmount?: number;
    approvedAmount?: number;
    receivedAmount?: number;
    authorizedAmount?: number;
  }
): ReimbursementPaymentOutcome {
  const claimAmount =
    submission.claimAmount ?? submission.submittedAmount ?? 0;
  return deriveReimbursementPaymentOutcome({
    claimAmount,
    authorizedAmount:
      submission.authorizedAmount ?? submission.approvedAmount,
    receivedAmount: submission.receivedAmount,
  });
}

/** Contract payment is never a CostRecord or CostSubmission. */
export function isContractPaymentRecord(
  record: CostRecord | CostSubmission | ContractPaymentRecord
): record is ContractPaymentRecord {
  return "expectedAmount" in record && !("costId" in record);
}

/** @deprecated Prefer isContractPaymentRecord */
export const isContractPayment = isContractPaymentRecord;
