import type {
  EccAgentDutyStatus,
  EccCentreOverallStatus,
  EccDailyOpsPeriod,
  EccIssueClassification,
  EccIssueStatus,
  EccPersonRole,
  EccPriority,
  EccReportingDimension,
  EccRequestOrigin,
  EccRequestResponsibility,
  EccRequestStatus,
  EccSectionCondition,
  EccSeverity,
  EccShiftCoverageStatus,
  EccStaffingStatus,
  EccFinanceCategory,
  EccFinanceTransactionStatus,
  EccFinanceCommitmentStatus,
} from "./types";

export const ECC_CENTRE_OVERALL_STATUS_LABELS: Record<
  EccCentreOverallStatus,
  string
> = {
  operational: "Operational",
  operational_with_issues: "Operational with Issues",
  disrupted: "Disrupted",
  down: "Down",
};

export const ECC_SECTION_CONDITION_LABELS: Record<EccSectionCondition, string> =
  {
    normal: "Normal",
    issue: "Issue",
    disrupted: "Disrupted",
  };

/** @deprecated Use ECC_CENTRE_OVERALL_STATUS_LABELS / ECC_SECTION_CONDITION_LABELS */
export const ECC_OPERATIONAL_STATUS_LABELS: Record<string, string> = {
  ...ECC_CENTRE_OVERALL_STATUS_LABELS,
  ...ECC_SECTION_CONDITION_LABELS,
  attention: "Needs attention",
  unknown: "Not stated",
};

export const ECC_STAFFING_STATUS_LABELS: Record<EccStaffingStatus, string> = {
  ready: "Ready",
  constrained: "Constrained",
  unavailable: "Unavailable",
  unknown: "Not stated",
};

export const ECC_PERSON_ROLE_LABELS: Record<EccPersonRole, string> = {
  ecc_manager: "ECC Manager",
  relationship_officer: "Relationship Officer",
  agent: "Agent",
};

export const ECC_AGENT_DUTY_STATUS_LABELS: Record<EccAgentDutyStatus, string> = {
  on_duty: "On duty",
  signed_in: "Signed in",
  signed_out: "Signed out",
  off_duty: "Off duty",
  absent: "Absent",
};

export const ECC_SHIFT_COVERAGE_LABELS: Record<EccShiftCoverageStatus, string> =
  {
    adequate: "Adequate",
    constrained: "Constrained",
    uncovered: "Uncovered",
    unknown: "Unknown",
  };

export const ECC_DAILY_OPS_PERIOD_LABELS: Record<EccDailyOpsPeriod, string> = {
  morning: "Morning",
  evening: "Evening",
  ad_hoc: "Ad hoc",
};

export const ECC_DAILY_OPS_SECTION_LABELS: Record<
  "centre" | "call" | "facility" | "technical",
  string
> = {
  centre: "Centre operations",
  call: "Call operations",
  facility: "Facility",
  technical: "Technical",
};

export const ECC_ISSUE_CLASSIFICATION_LABELS: Record<
  EccIssueClassification,
  string
> = {
  operational: "Operational",
  technical: "Technical",
};

export const ECC_SEVERITY_LABELS: Record<EccSeverity, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  critical: "Critical",
};

export const ECC_PRIORITY_LABELS: Record<EccPriority, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  urgent: "Urgent",
};

export const ECC_ISSUE_STATUS_LABELS: Record<EccIssueStatus, string> = {
  identified: "Identified",
  recorded: "Recorded",
  assessed: "Assessed",
  in_treatment: "In treatment",
  escalated: "Escalated",
  resolved: "Resolved",
  closed: "Closed",
};

export const ECC_ISSUE_TRANSITIONS: Record<
  EccIssueStatus,
  readonly EccIssueStatus[]
> = {
  identified: ["recorded", "closed"],
  recorded: ["assessed", "closed"],
  assessed: ["in_treatment", "escalated", "closed"],
  in_treatment: ["escalated", "resolved", "closed"],
  escalated: ["in_treatment", "resolved", "closed"],
  resolved: ["closed", "in_treatment"],
  closed: [],
};

export const ECC_REQUEST_ORIGIN_LABELS: Record<EccRequestOrigin, string> = {
  operational: "Operational",
  technical: "Technical",
};

export const ECC_REQUEST_RESPONSIBILITY_LABELS: Record<
  EccRequestResponsibility,
  string
> = {
  company: "Company / PayChex",
  client: "Client / NCC",
};

export const ECC_REQUEST_STATUS_LABELS: Record<EccRequestStatus, string> = {
  submitted: "Submitted",
  with_relationship_manager: "With Relationship Manager",
  with_downstream: "With downstream team",
  in_follow_up: "In follow-up",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const ECC_REQUEST_TRANSITIONS: Record<
  EccRequestStatus,
  readonly EccRequestStatus[]
> = {
  submitted: ["with_relationship_manager", "cancelled"],
  with_relationship_manager: ["with_downstream", "in_follow_up", "cancelled"],
  with_downstream: ["in_follow_up", "resolved", "cancelled"],
  in_follow_up: ["with_downstream", "resolved", "cancelled"],
  resolved: ["closed", "in_follow_up"],
  closed: [],
  cancelled: [],
};

export const ECC_OPEN_ISSUE_STATUSES: readonly EccIssueStatus[] = [
  "identified",
  "recorded",
  "assessed",
  "in_treatment",
  "escalated",
];

export const ECC_OPEN_REQUEST_STATUSES: readonly EccRequestStatus[] = [
  "submitted",
  "with_relationship_manager",
  "with_downstream",
  "in_follow_up",
];

export const ECC_REPORTING_DIMENSIONS: readonly EccReportingDimension[] = [
  {
    id: "daily-ops",
    label: "Daily operations records",
    description: "Morning / evening / ad-hoc centre state snapshots.",
    status: "available",
  },
  {
    id: "call-activity",
    label: "Call activity",
    description:
      "Counts and notes from daily ops. Exact metric definitions pending centres.",
    status: "pending_definition",
  },
  {
    id: "call-uptime",
    label: "Call-centre operational uptime",
    description: "Availability of centre operations over the reporting period.",
    status: "pending_definition",
  },
  {
    id: "facility-condition",
    label: "Facility condition",
    description: "From daily ops facility section and operational issues.",
    status: "available",
  },
  {
    id: "technical-condition",
    label: "Technical / equipment condition",
    description: "From daily ops technical section and technical issues.",
    status: "available",
  },
  {
    id: "escalations",
    label: "Escalations",
    description: "Issues in escalated state and escalation history.",
    status: "available",
  },
  {
    id: "requests",
    label: "Requests",
    description: "Open and resolved ECC requests by responsibility.",
    status: "available",
  },
  {
    id: "corrective-actions",
    label: "Corrective actions",
    description: "Action and resolution history on ECC issues and requests.",
    status: "available",
  },
  {
    id: "equipment-maintenance",
    label: "Maintenance",
    description:
      "May later reference platform Assets / Work — not duplicated here.",
    status: "pending_definition",
  },
  {
    id: "issue-resolution",
    label: "Resolved / unresolved issues",
    description: "Counts from the ECC issue register.",
    status: "available",
  },
];

/** Operational ECC spending categories — extend carefully; not a full CoA. */
export const ECC_FINANCE_CATEGORIES: readonly EccFinanceCategory[] = [
  "facilities",
  "utilities",
  "connectivity_technical",
  "staffing_operations",
  "maintenance",
  "other",
] as const;

export const ECC_FINANCE_CATEGORY_LABELS: Record<EccFinanceCategory, string> = {
  facilities: "Facilities",
  utilities: "Utilities",
  connectivity_technical: "Connectivity / Technical",
  staffing_operations: "Staffing / Operations",
  maintenance: "Maintenance",
  other: "Other",
};

export const ECC_FINANCE_TRANSACTION_STATUS_LABELS: Record<
  EccFinanceTransactionStatus,
  string
> = {
  recorded: "Recorded",
  pending: "Pending",
  settled: "Settled",
  cancelled: "Cancelled",
};

export const ECC_FINANCE_COMMITMENT_STATUS_LABELS: Record<
  EccFinanceCommitmentStatus,
  string
> = {
  pending: "Pending",
  approved: "Approved",
  due: "Due",
  settled: "Settled",
  cancelled: "Cancelled",
};
