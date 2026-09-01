/**
 * Issue operational model (Phase 15).
 *
 * ISSUE → TREAT → WORK → EXECUTION → OUTCOME → COST/PAYMENT
 *
 * Work persistence (compatibility) = Maintenance sheet.
 * Incident = legacy compatibility only.
 * Financial foundation: `@/lib/operational/finance`.
 * Work domain: `@/lib/operational/work`.
 */

export type {
  ComposeIssueFromIncidentInput,
  ComposeIssueFromMaintenanceInput,
  ComposeIssueFromRequestInput,
  ComposeIssueWorkOrderInput,
  Issue,
  IssueAction,
  IssueActionId,
  IssueApprovalAuthority,
  IssueClassification,
  IssueExecutionKind,
  IssueExecutionRef,
  IssueOperationalView,
  IssueOutcome,
  IssueOutcomeKind,
  IssuePriority,
  IssueSource,
  IssueStatus,
  IssueTreatmentKind,
  IssueTreatmentRef,
  IssueWorkOrderRef,
} from "./types";

export type {
  IssueAuthorityContext,
  IssueAuthorityRole,
} from "./authority";

export type {
  CostSubmissionContract,
  CostSubmissionStatus,
} from "./costSubmission";

export type {
  IssueOperationalStage,
  IssueRootKind,
} from "./model";

export { ISSUE_MODEL_PHASE } from "./phase";

export {
  FM_LOG_ISSUE_SIDE_EFFECT_MODE,
  ISSUE_EXECUTION_IMPLEMENTATIONS,
  ISSUE_MODEL_OPEN_DECISIONS,
  ISSUE_OPERATIONAL_CHAIN,
  ISSUE_ROOT_KINDS,
  ISSUE_TREATMENT_IMPLEMENTATIONS,
} from "./model";

export {
  ISSUE_AUTHORITY_NOTES,
  ISSUE_AUTHORITY_ROLES,
} from "./authority";

export {
  COST_SUBMISSION_FLOW,
  COST_SUBMISSION_OPEN_DECISIONS,
} from "./costSubmission";

export {
  INCIDENT_POLICY,
  SIGNIFICANT_INCIDENT_TYPES,
  isSignificantIncidentType,
} from "./incidentPolicy";

export {
  classificationFromRequestType,
  isIncidentCancelled,
  isIncidentSuccessfullyTerminal,
  isMaintenanceCancelled,
  isMaintenanceSuccessfullyTerminal,
  mapIncidentStatusToIssueStatus,
  mapIncidentTypeToClassification,
  mapMaintenanceStatusToIssueStatus,
  mapRequestStatusToIssueStatus,
  mapSeverityToIssuePriority,
} from "./status";

export {
  mapIncidentToTreatmentRef,
  mapMaintenanceToTreatmentRef,
  mapWorkOrderToIssueRef,
  mapWorkToTreatmentRef,
} from "./mapTreatments";

export { composeIssueFromRequest } from "./composeIssueFromRequest";

export {
  composeIssueFromIncident,
  composeIssueFromMaintenance,
} from "./composeFromRoots";

export { deriveIssueOutcome } from "./outcome";

export {
  deriveIssueExecutions,
  JOB_ORDER_BOUNDARY,
  WORK_ORDER_BOUNDARY,
  mapWorkOrderToExecutionRef,
} from "./execution";

export { deriveIssueActions, getIssueAction, isSignificantIssue } from "./actions";

export { buildIssueOperationalView } from "./buildOperationalView";

export {
  composeIssueFromTreatmentDetail,
  composeOperationalViewFromTreatmentDetail,
  toComposeInputFromTreatmentDetail,
} from "./composeFromDetail";
