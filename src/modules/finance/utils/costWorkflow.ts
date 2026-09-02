/**
 * Derived operational-cost workflow and reimbursement eligibility.
 *
 * CostRecord persists only reimbursability (unknown | reimbursable | non_reimbursable).
 * Submitted / reimbursed are derived from CostSubmission membership and Payment availability.
 * Do not invent CostRecord sheet fields for submission or payment status.
 */

import type { CostRecord, CostSubmission } from "@/lib/operational/finance/types";

/** Persisted reimbursement classification on CostRecord. */
export type CostReimbursementEligibility =
  | "not_eligible"
  | "eligible"
  | "submitted"
  | "reimbursed";

/**
 * Operational cost lifecycle for Finance UI.
 * Recorded is always true once a CostRecord exists.
 */
export type CostWorkflowStage =
  | "needs_classification"
  | "classified_not_reimbursable"
  | "eligible_for_reimbursement"
  | "submitted"
  | "reimbursed";

export const COST_REIMBURSEMENT_ELIGIBILITY_LABELS: Record<
  CostReimbursementEligibility,
  string
> = {
  not_eligible: "Not eligible",
  eligible: "Eligible",
  submitted: "Submitted",
  reimbursed: "Reimbursed",
};

export const COST_WORKFLOW_STAGE_LABELS: Record<CostWorkflowStage, string> = {
  needs_classification: "Needs classification",
  classified_not_reimbursable: "Classified · not reimbursable",
  eligible_for_reimbursement: "Eligible for reimbursement",
  submitted: "Submitted",
  reimbursed: "Reimbursed",
};

export type CostWorkflowSnapshot = {
  stage: CostWorkflowStage;
  stageLabel: string;
  eligibility: CostReimbursementEligibility;
  eligibilityLabel: string;
  /** True when reimbursability is still unknown. */
  needsClassification: boolean;
  /** True when cost may be added to a new reimbursement submission. */
  canStartSubmission: boolean;
  /** Linked CostSubmission when this cost appears in one. */
  linkedSubmissionId: string | null;
  /** Payment outcomes are not yet recorded in Finance. */
  reimbursementPaymentRecorded: boolean;
};

export function findSubmissionForCost(
  costId: string,
  submissions: CostSubmission[]
): CostSubmission | null {
  const match = submissions.find(
    (submission) =>
      submission.status !== "cancelled" &&
      submission.costRecordIds.includes(costId)
  );
  return match ?? null;
}

/**
 * Derive workflow state from CostRecord + optional linked submission.
 * `paymentRecorded` stays false until Payment exists in the product.
 */
export function deriveCostWorkflow(
  record: Pick<CostRecord, "reimbursability" | "costId">,
  linkedSubmission: Pick<CostSubmission, "submissionId" | "status"> | null,
  options?: { paymentRecorded?: boolean }
): CostWorkflowSnapshot {
  const paymentRecorded = options?.paymentRecorded === true;
  const linkedSubmissionId = linkedSubmission?.submissionId ?? null;

  if (record.reimbursability === "unknown") {
    return {
      stage: "needs_classification",
      stageLabel: COST_WORKFLOW_STAGE_LABELS.needs_classification,
      eligibility: "not_eligible",
      eligibilityLabel: "Needs classification",
      needsClassification: true,
      canStartSubmission: false,
      linkedSubmissionId: null,
      reimbursementPaymentRecorded: false,
    };
  }

  if (record.reimbursability === "non_reimbursable") {
    return {
      stage: "classified_not_reimbursable",
      stageLabel: COST_WORKFLOW_STAGE_LABELS.classified_not_reimbursable,
      eligibility: "not_eligible",
      eligibilityLabel: COST_REIMBURSEMENT_ELIGIBILITY_LABELS.not_eligible,
      needsClassification: false,
      canStartSubmission: false,
      linkedSubmissionId: null,
      reimbursementPaymentRecorded: false,
    };
  }

  // reimbursable
  if (linkedSubmissionId && paymentRecorded) {
    return {
      stage: "reimbursed",
      stageLabel: COST_WORKFLOW_STAGE_LABELS.reimbursed,
      eligibility: "reimbursed",
      eligibilityLabel: COST_REIMBURSEMENT_ELIGIBILITY_LABELS.reimbursed,
      needsClassification: false,
      canStartSubmission: false,
      linkedSubmissionId,
      reimbursementPaymentRecorded: true,
    };
  }

  if (linkedSubmissionId) {
    return {
      stage: "submitted",
      stageLabel: COST_WORKFLOW_STAGE_LABELS.submitted,
      eligibility: "submitted",
      eligibilityLabel: COST_REIMBURSEMENT_ELIGIBILITY_LABELS.submitted,
      needsClassification: false,
      canStartSubmission: false,
      linkedSubmissionId,
      reimbursementPaymentRecorded: false,
    };
  }

  return {
    stage: "eligible_for_reimbursement",
    stageLabel: COST_WORKFLOW_STAGE_LABELS.eligible_for_reimbursement,
    eligibility: "eligible",
    eligibilityLabel: COST_REIMBURSEMENT_ELIGIBILITY_LABELS.eligible,
    needsClassification: false,
    canStartSubmission: true,
    linkedSubmissionId: null,
    reimbursementPaymentRecorded: false,
  };
}
