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
} from "./types";

/** Financial state must never resolve an Issue (and vice versa). */
export const FINANCIAL_OPERATIONAL_COUPLING = {
  financialStateResolvesIssue: false,
  issueResolutionImpliesPaymentReceived: false,
  operationalStatusIsReimbursementStatus: false,
} as const;

export const FINANCIAL_DOMAIN_IMPLEMENTED = {
  persistence: false,
  ui: false,
  paymentProcessing: false,
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
 */
export function assertDistinctCommercialAmounts(submission: {
  actualAmount: number;
  submittedAmount: number;
  markup?: MarkupRepresentation;
  approvedAmount?: number;
  receivedAmount?: number;
}): void {
  // Identity check: callers must supply both actual and submitted; they may equal
  // numerically when no markup, but both fields must exist as first-class values.
  if (
    typeof submission.actualAmount !== "number" ||
    typeof submission.submittedAmount !== "number"
  ) {
    throw new Error("actualAmount and submittedAmount must both be numbers");
  }
  void submission.markup;
  void submission.approvedAmount;
  void submission.receivedAmount;
}

/**
 * Conceptual outstanding = basis − received (when received known).
 * Prefer approvedAmount as basis when present; else submittedAmount.
 * Does not invent payment transactions.
 */
export function deriveOutstandingAmount(options: {
  submittedAmount: number;
  approvedAmount?: number;
  receivedAmount?: number;
}): number | undefined {
  if (options.receivedAmount === undefined) return undefined;
  const basis =
    options.approvedAmount !== undefined
      ? options.approvedAmount
      : options.submittedAmount;
  return basis - options.receivedAmount;
}

export function deriveReimbursementPaymentOutcome(
  submission: Pick<
    CostSubmission,
    "submittedAmount" | "approvedAmount" | "receivedAmount"
  >
): ReimbursementPaymentOutcome {
  const received = submission.receivedAmount ?? 0;
  if (received <= 0) return "unpaid";
  const basis =
    submission.approvedAmount !== undefined
      ? submission.approvedAmount
      : submission.submittedAmount;
  if (received >= basis) return "fully_paid";
  return "partially_paid";
}

/** Non-reimbursable costs must not carry a reimbursable submission expectation. */
export function isValidNonReimbursableCost(cost: CostRecord): boolean {
  return (
    cost.costClass === "non_reimbursable" &&
    cost.reimbursementEligible === false &&
    typeof cost.actualAmount === "number"
  );
}

export function isValidReimbursableCost(cost: CostRecord): boolean {
  return (
    cost.costClass === "reimbursable" &&
    cost.reimbursementEligible === true &&
    typeof cost.actualAmount === "number"
  );
}

/** Contract payment is never a CostRecord or CostSubmission. */
export function isContractPaymentRecord(
  record: CostRecord | CostSubmission | ContractPaymentRecord
): record is ContractPaymentRecord {
  return "expectedAmount" in record && !("costClass" in record);
}

/** @deprecated Prefer isContractPaymentRecord */
export const isContractPayment = isContractPaymentRecord;
