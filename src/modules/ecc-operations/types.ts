/**
 * ECC Operations domain types — operational spine.
 *
 * Call metrics and some reporting fields remain extensible until
 * centre reporting requirements are finalized. No agent/call-taking model.
 *
 * Optional facilityId / assetId are ID-only links into platform masters —
 * not parallel Facility / Asset / Work / Finance / Vendor systems.
 */

import type { PlatformModuleSlug } from "@/lib/actions/types";

export const ECC_MODULE_SLUG = "ecc_operations" satisfies PlatformModuleSlug;
export const ECC_WORKSPACE_ID = "ecc-operations" as const;

/**
 * ECC user capabilities (platform_capability_grants).
 * Organisation module enablement is separate — module on ≠ user access.
 * Super Admin does not auto-receive these grants.
 */
export const ECC_CAPABILITIES = {
  /** Enter and use ECC Operations workspace surfaces. */
  view: "platform.ecc_operations.view",
} as const;

export type EccCapability =
  (typeof ECC_CAPABILITIES)[keyof typeof ECC_CAPABILITIES];

export function isEccCapability(value: unknown): value is EccCapability {
  return (
    typeof value === "string" &&
    (Object.values(ECC_CAPABILITIES) as string[]).includes(value)
  );
}

export type EccModuleSlug = typeof ECC_MODULE_SLUG;
export type EccWorkspaceId = typeof ECC_WORKSPACE_ID;

export type EccModuleContext = {
  moduleSlug: EccModuleSlug;
  workspaceId: EccWorkspaceId;
};

export function createEccModuleContext(): EccModuleContext {
  return {
    moduleSlug: ECC_MODULE_SLUG,
    workspaceId: ECC_WORKSPACE_ID,
  };
}

/** One-centre V1 identity — model supports additional centres later. */
export type EccCentre = {
  id: string;
  name: string;
  /** Optional link to existing Facility master data (ID only). */
  facilityId?: string;
};

export const DEFAULT_ECC_CENTRE: EccCentre = {
  id: "ECC-001",
  name: "Emergency Communication Centre",
  facilityId: "FAC-0001",
};

/**
 * Overall centre status for a Daily Operations snapshot (V1 — deliberately simple).
 */
export type EccCentreOverallStatus =
  | "operational"
  | "operational_with_issues"
  | "disrupted"
  | "down";

/**
 * Section-level condition. When `normal`, managers use "No issues to report"
 * and are not forced to enter narrative detail.
 */
export type EccSectionCondition = "normal" | "issue" | "disrupted";

export type EccStaffingStatus =
  | "ready"
  | "constrained"
  | "unavailable"
  | "unknown";

export type EccDailyOpsPeriod = "morning" | "evening" | "ad_hoc";

export type EccDailyOpsSectionKey =
  | "centre"
  | "call"
  | "facility"
  | "technical";

/** Centre operations section of a daily ops snapshot. */
export type EccCentreOperationsSection = {
  status: EccSectionCondition;
  staffingStatus: EccStaffingStatus;
  staffingReadiness: string;
  observations: string;
  /** Required when status is issue or disrupted. */
  disruptionNotes: string;
  noIssuesToReport: boolean;
};

/**
 * Call operations — established placeholders + extensible bag.
 * Not the final call KPI schema.
 */
export type EccCallOperationsSection = {
  status: EccSectionCondition;
  callsReceived?: string;
  callsHandled?: string;
  waiting?: string;
  missed?: string;
  escalated?: string;
  additionalMetrics: Record<string, string>;
  notes: string;
  noIssuesToReport: boolean;
};

/** Facility section of a daily ops snapshot. */
export type EccFacilitySection = {
  status: EccSectionCondition;
  condition: string;
  power: string;
  environment: string;
  issues: string;
  observations: string;
  noIssuesToReport: boolean;
};

/** Technical section — not a parallel asset registry. */
export type EccTechnicalSection = {
  status: EccSectionCondition;
  equipment: string;
  network: string;
  servers: string;
  software: string;
  callTakingSystems: string;
  incidents: string;
  observations: string;
  noIssuesToReport: boolean;
};

/**
 * Immutable historical snapshot of centre state at a point in time.
 * Content fields are not rewritten by later submissions.
 * `linkedIssueIds` may grow when issues are raised from this snapshot.
 */
export type EccDailyOpsRecord = {
  id: string;
  centreId: string;
  period: EccDailyOpsPeriod;
  /** Calendar date of the report (YYYY-MM-DD). */
  reportingDate: string;
  /** Submission timestamp (ISO). */
  recordedAt: string;
  recordedByName: string;
  overallStatus: EccCentreOverallStatus;
  centreOperations: EccCentreOperationsSection;
  callOperations: EccCallOperationsSection;
  facility: EccFacilitySection;
  technical: EccTechnicalSection;
  /** ECC Issue IDs raised or linked from this snapshot. */
  linkedIssueIds: string[];
  /** ECC Request IDs raised or linked from this snapshot. */
  linkedRequestIds: string[];
  createdAt: string;
};

export type EccIssueClassification = "operational" | "technical";

/** Controlled severity scale — reversible; aligned with platform severity vocabulary. */
export type EccSeverity = "low" | "medium" | "high" | "critical";

/** Identify → Record → Assess → Treat → Escalate → Resolve → Close */
export type EccIssueStatus =
  | "identified"
  | "recorded"
  | "assessed"
  | "in_treatment"
  | "escalated"
  | "resolved"
  | "closed";

export type EccIssueHistoryKind =
  | "status_change"
  | "action"
  | "escalation"
  | "resolution"
  | "closure"
  | "note";

export type EccIssueHistoryEntry = {
  id: string;
  at: string;
  byName: string;
  kind: EccIssueHistoryKind;
  fromStatus: EccIssueStatus | null;
  toStatus: EccIssueStatus | null;
  note?: string;
};

export type EccIssue = {
  id: string;
  centreId: string;
  occurredAt: string;
  classification: EccIssueClassification;
  severity: EccSeverity;
  title: string;
  description: string;
  status: EccIssueStatus;
  reporterName: string;
  currentOwnerName?: string;
  history: EccIssueHistoryEntry[];
  resolutionNotes?: string;
  closedAt?: string;
  closedByName?: string;
  relatedEccRequestId?: string;
  /** Daily ops snapshot this issue was raised from (if any). */
  sourceDailyOpsId?: string;
  sourceDailyOpsSection?: EccDailyOpsSectionKey;
  facilityId?: string;
  assetId?: string;
  createdAt: string;
  updatedAt: string;
};

export type EccRequestOrigin = "operational" | "technical";
export type EccRequestResponsibility = "company" | "client";

/** Controlled priority — reversible; does not imply SLA automation. */
export type EccPriority = "low" | "medium" | "high" | "urgent";

export type EccRequestStatus =
  | "submitted"
  | "with_relationship_manager"
  | "with_downstream"
  | "in_follow_up"
  | "resolved"
  | "closed"
  | "cancelled";

export type EccRequestHistoryKind =
  | "status_change"
  | "action"
  | "note"
  | "resolution"
  | "closure";

export type EccRequestHistoryEntry = {
  id: string;
  at: string;
  byName: string;
  kind: EccRequestHistoryKind;
  fromStatus: EccRequestStatus | null;
  toStatus: EccRequestStatus | null;
  note?: string;
};

export type EccRequest = {
  id: string;
  centreId: string;
  title: string;
  reason: string;
  description: string;
  origin: EccRequestOrigin;
  responsibility: EccRequestResponsibility;
  priority: EccPriority;
  status: EccRequestStatus;
  requestingManagerName: string;
  currentOwnerName?: string;
  history: EccRequestHistoryEntry[];
  evidenceNotes?: string;
  resolutionNotes?: string;
  closedAt?: string;
  closedByName?: string;
  relatedEccIssueId?: string;
  /** Daily ops snapshot this request was raised from (if any). */
  sourceDailyOpsId?: string;
  sourceDailyOpsSection?: EccDailyOpsSectionKey;
  facilityId?: string;
  assetId?: string;
  createdAt: string;
  updatedAt: string;
};

export type EccActivityKind = "daily_ops" | "issue" | "request";

export type EccActivityItem = {
  id: string;
  kind: EccActivityKind;
  at: string;
  title: string;
  detail?: string;
  href: string;
};

export type EccAttentionItem = {
  id: string;
  kind: "issue" | "request" | "escalation" | "status" | "daily_ops_issue";
  title: string;
  detail: string;
  href: string;
};

export type EccOverviewSnapshot = {
  centre: EccCentre;
  asOf: string;
  latestDailyOps: EccDailyOpsRecord | null;
  overallStatus: EccCentreOverallStatus | "unknown";
  facilityStatus: EccSectionCondition | "unknown";
  technicalStatus: EccSectionCondition | "unknown";
  centreSectionStatus: EccSectionCondition | "unknown";
  staffingStatus: EccStaffingStatus;
  staffingReadiness: string;
  callActivitySummary: string;
  /** Issues linked from recent daily ops snapshots. */
  issuesFromRecentOps: Array<{
    id: string;
    title: string;
    href: string;
  }>;
  openIssueCount: number;
  openRequestCount: number;
  escalatedIssueCount: number;
  highUrgentOpenCount: number;
  waitingOnOthersCount: number;
  recentResolutions: Array<{
    id: string;
    kind: "issue" | "request";
    title: string;
    at: string;
    href: string;
  }>;
  attentionItems: EccAttentionItem[];
  recentActivity: EccActivityItem[];
};

export type EccReportingDimension = {
  id: string;
  label: string;
  description: string;
  status: "available" | "pending_definition";
  currentValue?: string;
  href?: string;
};

export type EccReportingMetric = {
  id: string;
  label: string;
  value: string | number;
  detail?: string;
  href?: string;
};

export type EccReportingTrendPoint = {
  key: string;
  label: string;
  value: number;
};

export type EccReportingStatusHistoryRow = {
  id: string;
  at: string;
  period: string;
  periodKey: EccDailyOpsPeriod;
  reportingDate: string;
  overallStatus: string;
  overallStatusKey: EccCentreOverallStatus;
  centreOpsStatus: string;
  centreOpsStatusKey: EccSectionCondition;
  facilityStatus: string;
  facilityStatusKey: EccSectionCondition;
  technicalStatus: string;
  technicalStatusKey: EccSectionCondition;
  staffingStatus: string;
  staffingStatusKey: EccStaffingStatus;
  submittedBy: string;
  href: string;
};

export type EccReportingTrendSeriesPoint = {
  key: string;
  label: string;
  total: number;
  operational: number;
  withIssues: number;
  disrupted: number;
};

export type EccReportingCentrePerformanceBlock = {
  id: "centre" | "facility" | "technical" | "staffing";
  label: string;
  statusLabel: string;
  statusKey: string;
  openIssues: number;
  openRequests: number;
};

export type EccReportingCallPeriodRow = {
  id: string;
  at: string;
  period: string;
  reportingDate: string;
  received?: string;
  handled?: string;
  waiting?: string;
  missed?: string;
  escalated?: string;
  notes?: string;
  additionalCount: number;
  href: string;
};

export type EccReportingSnapshot = {
  centre: EccCentre;
  asOf: string;
  dimensions: EccReportingDimension[];

  /** Centre state */
  latestOverallStatus: string;
  latestOverallStatusKey: EccCentreOverallStatus | null;
  latestCentreOpsStatus: string;
  latestCentreOpsStatusKey: EccSectionCondition | null;
  latestFacilityStatus: string;
  latestFacilityStatusKey: EccSectionCondition | null;
  latestTechnicalStatus: string;
  latestTechnicalStatusKey: EccSectionCondition | null;
  latestStaffingStatus: string;
  latestStaffingStatusKey: EccStaffingStatus | null;
  latestStaffingReadiness: string;
  latestDailyOpsId: string | null;
  latestRecordedAt: string | null;
  morningCount: number;
  eveningCount: number;
  adHocCount: number;
  dailyOpsCount: number;
  recurringSectionIssues: Array<{
    section: string;
    issueOrDisruptedCount: number;
    href: string;
  }>;
  centrePerformance: EccReportingCentrePerformanceBlock[];
  centreStatusHistory: EccReportingStatusHistoryRow[];

  /** Call operations — recorded activity only; schema not final. */
  callPeriods: EccReportingCallPeriodRow[];
  callActivityRecordedCount: number;

  /** Issues */
  openIssues: number;
  resolvedIssues: number;
  escalatedIssues: number;
  highCriticalOpenIssues: number;
  operationalOpenIssues: number;
  technicalOpenIssues: number;
  waitingIssues: number;
  issueMetrics: EccReportingMetric[];

  /** Requests */
  openRequests: number;
  resolvedRequests: number;
  withRmOrDownstream: number;
  companyResponsibilityOpen: number;
  clientResponsibilityOpen: number;
  highUrgentOpenRequests: number;
  waitingRequests: number;
  requestMetrics: EccReportingMetric[];

  /** Simple trends (derived counts). */
  dailyOpsByDate: EccReportingTrendPoint[];
  dailyOpsTrendSeries: EccReportingTrendSeriesPoint[];
  issuesOpenVsResolved: EccReportingTrendPoint[];
  issuesByClassification: EccReportingTrendPoint[];
  requestsByResponsibility: EccReportingTrendPoint[];
  submissionsByPeriod: EccReportingTrendPoint[];
};

export type EccCreateDailyOpsInput = Omit<
  EccDailyOpsRecord,
  | "id"
  | "createdAt"
  | "linkedIssueIds"
  | "linkedRequestIds"
  | "centreId"
  | "recordedAt"
> & {
  centreId?: string;
  recordedAt?: string;
};

export type EccRaiseIssueFromDailyOpsInput = {
  dailyOpsId: string;
  section: EccDailyOpsSectionKey;
  classification: EccIssueClassification;
  severity: EccSeverity;
  title: string;
  description: string;
  reporterName: string;
  currentOwnerName?: string;
};

export type EccRaiseRequestFromDailyOpsInput = {
  dailyOpsId: string;
  section: EccDailyOpsSectionKey;
  title: string;
  reason: string;
  description?: string;
  origin: EccRequestOrigin;
  responsibility: EccRequestResponsibility;
  priority: EccPriority;
  requestingManagerName: string;
  currentOwnerName?: string;
};

export type EccLinkIssueRequestInput = {
  issueId: string;
  requestId: string;
  byName: string;
  note?: string;
};

/** Manager register views — client-side filters over ECC records. */
export type EccRegisterView =
  | "open"
  | "urgent"
  | "mine"
  | "escalated"
  | "waiting"
  | "resolved"
  | "all";

export type EccCreateIssueInput = {
  classification: EccIssueClassification;
  severity: EccSeverity;
  title: string;
  description: string;
  reporterName: string;
  currentOwnerName?: string;
  occurredAt?: string;
  relatedEccRequestId?: string;
  sourceDailyOpsId?: string;
  sourceDailyOpsSection?: EccDailyOpsSectionKey;
  facilityId?: string;
  assetId?: string;
  centreId?: string;
  initialNote?: string;
};

export type EccTransitionIssueInput = {
  id: string;
  toStatus: EccIssueStatus;
  byName: string;
  note?: string;
  currentOwnerName?: string;
  resolutionNotes?: string;
};

export type EccAppendIssueActionInput = {
  id: string;
  byName: string;
  note: string;
  kind?: Extract<EccIssueHistoryKind, "action" | "note" | "escalation">;
  currentOwnerName?: string;
};

export type EccCreateRequestInput = {
  title: string;
  reason: string;
  description: string;
  origin: EccRequestOrigin;
  responsibility: EccRequestResponsibility;
  priority: EccPriority;
  requestingManagerName: string;
  currentOwnerName?: string;
  evidenceNotes?: string;
  relatedEccIssueId?: string;
  sourceDailyOpsId?: string;
  sourceDailyOpsSection?: EccDailyOpsSectionKey;
  facilityId?: string;
  assetId?: string;
  centreId?: string;
  initialNote?: string;
};

export type EccTransitionRequestInput = {
  id: string;
  toStatus: EccRequestStatus;
  byName: string;
  note?: string;
  currentOwnerName?: string;
  resolutionNotes?: string;
};

export type EccAppendRequestActionInput = {
  id: string;
  byName: string;
  note: string;
  kind?: Extract<EccRequestHistoryKind, "action" | "note">;
  currentOwnerName?: string;
};

/** @deprecated Prefer EccCentreOverallStatus / EccSectionCondition */
export type EccOperationalStatus = EccCentreOverallStatus | EccSectionCondition;

/** ECC People / staffing */
export type EccPersonRole =
  | "ecc_manager"
  | "relationship_officer"
  | "agent";

export type EccPersonRecordStatus = "active" | "inactive";

export type EccAgentDutyStatus =
  | "on_duty"
  | "signed_in"
  | "signed_out"
  | "off_duty"
  | "absent";

export type EccShiftCoverageStatus =
  | "adequate"
  | "constrained"
  | "uncovered"
  | "unknown";

export type EccPerson = {
  id: string;
  centreId: string;
  name: string;
  role: EccPersonRole;
  contactEmail?: string;
  contactPhone?: string;
  status: EccPersonRecordStatus;
  createdAt: string;
  updatedAt: string;
};

export type EccShift = {
  id: string;
  centreId: string;
  label: string;
  startsAt: string;
  endsAt: string;
  isCurrent: boolean;
  coverageStatus: EccShiftCoverageStatus;
  assignedPersonIds: string[];
  createdAt: string;
  updatedAt: string;
};

export type EccAttendanceRecord = {
  id: string;
  centreId: string;
  personId: string;
  personName: string;
  shiftId?: string;
  shiftLabel?: string;
  attendanceDate: string;
  signedInAt?: string;
  signedOutAt?: string;
  status: EccAgentDutyStatus;
  createdAt: string;
  updatedAt: string;
};

export type EccAgentRow = {
  person: EccPerson;
  dutyStatus: EccAgentDutyStatus;
  shiftLabel?: string;
  signedInAt?: string;
  signedOutAt?: string;
  openAttendanceId?: string;
};

export type EccCurrentShiftSummary = {
  shift: EccShift | null;
  agentsAssigned: number;
  agentsSignedIn: number;
  coverageStatus: EccShiftCoverageStatus;
};

export type EccPeopleSnapshot = {
  centreId: string;
  asOf: string;
  managers: EccPerson[];
  relationshipOfficers: EccPerson[];
  agents: EccAgentRow[];
  currentShift: EccCurrentShiftSummary;
  recentAttendance: EccAttendanceRecord[];
};

export type EccCreatePersonInput = {
  name: string;
  role: EccPersonRole;
  contactEmail?: string;
  contactPhone?: string;
  centreId?: string;
};

export type EccSignInInput = {
  personId: string;
  shiftId?: string;
};

export type EccSignOutInput = {
  personId: string;
};

export type EccEnsureCurrentShiftInput = {
  label: string;
  startsAt: string;
  endsAt: string;
  assignedPersonIds?: string[];
  centreId?: string;
};

export type EccSetCurrentShiftAssignmentsInput = {
  assignedPersonIds: string[];
  centreId?: string;
};

/** ECC operational finance (centre-scoped — not organisation Finance). */
export type EccFinanceCategory =
  | "facilities"
  | "utilities"
  | "connectivity_technical"
  | "staffing_operations"
  | "maintenance"
  | "other";

export type EccFinanceTransactionStatus =
  | "recorded"
  | "pending"
  | "settled"
  | "cancelled";

export type EccFinanceCommitmentStatus =
  | "pending"
  | "approved"
  | "due"
  | "settled"
  | "cancelled";

export type EccFinanceBudgetStatus = "active" | "superseded" | "closed";

export type EccFinanceBudget = {
  id: string;
  centreId: string;
  periodLabel: string;
  amount: number;
  currency: string;
  status: EccFinanceBudgetStatus;
  createdBy: string;
  createdAt: string;
};

export type EccFinanceTransaction = {
  id: string;
  centreId: string;
  date: string;
  reference: string;
  description: string;
  category: EccFinanceCategory;
  amount: number;
  currency: string;
  status: EccFinanceTransactionStatus;
  recordedBy: string;
  createdAt: string;
};

export type EccFinanceCommitment = {
  id: string;
  centreId: string;
  description: string;
  category: EccFinanceCategory;
  expectedAmount: number;
  currency: string;
  dueDate?: string;
  status: EccFinanceCommitmentStatus;
  recordedBy: string;
  createdAt: string;
};

export type EccFinanceBudgetPosition = {
  budget: number | null;
  committed: number | null;
  spent: number | null;
  remaining: number | null;
};

export type EccFinanceSnapshot = {
  centreId: string;
  asOf: string;
  periodLabel: string;
  currency: string;
  budget: EccFinanceBudget | null;
  totalExpenditure: number | null;
  pendingCommitmentsTotal: number | null;
  availableBudget: number | null;
  budgetPosition: EccFinanceBudgetPosition;
  transactions: EccFinanceTransaction[];
  commitments: EccFinanceCommitment[];
  categories: EccFinanceCategory[];
};

export type EccCreateFinanceBudgetInput = {
  periodLabel: string;
  amount: number;
  currency?: string;
  createdBy: string;
  centreId?: string;
};

export type EccCreateFinanceTransactionInput = {
  date: string;
  reference?: string;
  description: string;
  category: EccFinanceCategory;
  amount: number;
  currency?: string;
  status: EccFinanceTransactionStatus;
  recordedBy: string;
  centreId?: string;
};

export type EccCreateFinanceCommitmentInput = {
  description: string;
  category: EccFinanceCategory;
  expectedAmount: number;
  currency?: string;
  dueDate?: string;
  status?: EccFinanceCommitmentStatus;
  recordedBy: string;
  centreId?: string;
};

/** ECC accountability / audit trail */
export type EccAuditEntityType =
  | "issue"
  | "request"
  | "person"
  | "shift"
  | "attendance"
  | "finance_budget"
  | "finance_transaction"
  | "finance_commitment"
  | "daily_ops";

export type EccAuditEvent = {
  id: string;
  centreId?: string;
  actorUserId?: string;
  actorName: string;
  actorEmail?: string;
  action: string;
  entityType: EccAuditEntityType;
  entityId: string;
  description: string;
  metadata: Record<string, unknown>;
  createdAt: string;
};

export type EccRecordAuditEventInput = {
  centreId?: string;
  actorUserId?: string;
  actorName: string;
  actorEmail?: string;
  action: string;
  entityType: EccAuditEntityType;
  entityId: string;
  description: string;
  metadata?: Record<string, unknown>;
};

export type EccAuditListFilter = {
  centreId?: string;
  entityType?: EccAuditEntityType;
  entityId?: string;
  action?: string;
  limit?: number;
};

export type EccActorContext = {
  userId: string;
  email: string;
  name: string;
};
