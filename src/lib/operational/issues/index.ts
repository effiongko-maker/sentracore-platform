/**
 * Issue operational model (Phase 6).
 *
 * Conceptual primary operational object composed over existing domains.
 * No Issue sheet/table; no second status store; no Job Order/payment engines.
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

export { ISSUE_MODEL_PHASE } from "./phase";

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

export { deriveIssueActions, getIssueAction } from "./actions";

export { buildIssueOperationalView } from "./buildOperationalView";

export {
  composeIssueFromTreatmentDetail,
  composeOperationalViewFromTreatmentDetail,
  toComposeInputFromTreatmentDetail,
} from "./composeFromDetail";
