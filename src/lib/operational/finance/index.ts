/**
 * Financial domain foundation (Phase 12).
 * Types and docs only — see MODEL.md.
 */

export type {
  ContractPaymentRecord,
  ContractPaymentStatus,
  CostClass,
  CostOrigin,
  CostRecord,
  CostSubmission,
  CostSubmissionContract,
  CostSubmissionStatus,
  FinancialCurrencyCode,
  FinancialOperationalRefs,
  FinancialRecordKind,
  MarkupRepresentation,
  ReimbursementPaymentOutcome,
} from "./types";

export {
  COST_SUBMISSION_FLOW,
  COST_SUBMISSION_OPEN_DECISIONS,
  FINANCIAL_DOMAIN_IMPLEMENTED,
  FINANCIAL_OPEN_DECISIONS,
  FINANCIAL_OPERATIONAL_COUPLING,
  assertDistinctCommercialAmounts,
  deriveOutstandingAmount,
  deriveReimbursementPaymentOutcome,
  isContractPayment,
  isContractPaymentRecord,
  isValidNonReimbursableCost,
  isValidReimbursableCost,
} from "./helpers";
