/**
 * Financial domain foundation.
 * Types and docs only — see MODEL.md.
 */

export type {
  ContractPaymentRecord,
  ContractPaymentStatus,
  CostCategory,
  CostClass,
  CostEvidence,
  CostOrigin,
  CostRecord,
  CostReimbursability,
  CostSubmission,
  CostSubmissionContract,
  CostSubmissionLifecycleStatus,
  CostSubmissionPackage,
  CostSubmissionStatus,
  FinancialCurrencyCode,
  FinancialOperationalRefs,
  FinancialRecordKind,
  MarkupRepresentation,
  ReimbursementPaymentOutcome,
  ReimbursementPaymentReconciliation,
} from "./types";

export {
  COST_CATEGORIES,
  COST_CATEGORY_LABELS,
  COST_REIMBURSABILITY_VALUES,
  DEFAULT_COST_RECORD_CURRENCY,
  getAuthoritativeAmount,
  hasOperationalReference,
  isCostRecordEvidenceComplete,
  isCostRecordReimbursable,
  isValidCostCategory,
  isValidCostReimbursability,
  validateCostRecord,
  type CostRecordValidationResult,
} from "./costRecord";

export {
  COST_SUBMISSION_ID_PATTERN,
  COST_SUBMISSION_LIFECYCLE_STATUSES,
  DEFAULT_COST_SUBMISSION_CURRENCY,
  FORBIDDEN_MARKUP_RATE_LITERALS,
  assertDistinctClaimAmounts,
  canSubmitCostSubmission,
  getSubmissionActualCostTotal,
  getSubmissionClaimAmount,
  getSubmissionCostCount,
  getSubmissionCostRecordIds,
  isCostSubmissionCancelled,
  isCostSubmissionDraft,
  isCostSubmissionPackagePresent,
  isCostSubmissionQueried,
  isCostSubmissionReturned,
  isCostSubmissionSubmitted,
  isValidCostSubmissionId,
  isValidCostSubmissionLifecycleStatus,
  validateCostSubmission,
  type CostSubmissionValidationResult,
} from "./costSubmission";

export {
  COST_RECORD_SHEET_HEADERS,
  FORBIDDEN_COST_RECORD_SHEET_HEADERS,
  LEGACY_COST_RECORD_ESTIMATED_AMOUNT_HEADER,
  costRecordToRemotePayload,
  costRecordToRow,
  legacyRowToCostRecord,
  mapRemoteCostRecord,
  readRemoteBudgetedAmount,
  rowToCostRecord,
  type CostRecordRow,
  type CostRecordSheetHeader,
  type RemoteCostRecord,
} from "./costRecordRow";

export {
  COST_SUBMISSION_FLOW,
  COST_SUBMISSION_OPEN_DECISIONS,
  FINANCIAL_DOMAIN_IMPLEMENTED,
  FINANCIAL_OPEN_DECISIONS,
  FINANCIAL_OPERATIONAL_COUPLING,
  assertDistinctCommercialAmounts,
  deriveOutstandingAmount,
  deriveReimbursementPaymentOutcome,
  deriveReimbursementPaymentOutcomeFromSubmission,
  isContractPayment,
  isContractPaymentRecord,
} from "./helpers";
