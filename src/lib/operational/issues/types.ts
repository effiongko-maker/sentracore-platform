/**
 * Issue operational model — Phase 11 application abstraction.
 *
 * Canonical chain:
 *   ISSUE → TREATMENT → EXECUTION (optional) → OUTCOME → COST / PAYMENT (future)
 *
 * Issue = something that needs attention (composed lens — never a second status store).
 * Treatment = what the facility team is doing (existing domain capabilities).
 * Execution = formal instrument when required (Work Order today; Job Order future).
 * Outcome = derived from authoritative operational records.
 *
 * Persistence remains on: Request | Maintenance | Incident | Work Order
 * No Issue sheet. No Job Order / payment persistence.
 *
 * Maintenance and Incident are existing capabilities — not mandatory categories of every Issue.
 *
 * @see MODEL.md · model.ts
 */

/** How the Issue entered SentraCore. */
export type IssueSource =
  /** Staff/occupant portal — backed by a Request intake record. */
  | "staff_request"
  /** Facility manager logged the problem directly (no fake Request). */
  | "facility_manager"
  | "system"
  | "api";

/**
 * Conceptual Issue lifecycle — simpler than underlying domain statuses.
 * Derived only; underlying treatment domains keep their richer statuses.
 */
export type IssueStatus =
  | "reported"
  | "being_treated"
  | "resolved"
  | "cancelled";

/**
 * Optional classification attribute on an Issue.
 * Not a parallel operational workflow and not a Maintenance-vs-Incident fork.
 */
export type IssueClassification =
  | "routine"
  | "safety"
  | "service_disruption"
  | "property_damage"
  | "equipment_failure"
  | "environmental"
  | "other";

export type IssuePriority = "low" | "medium" | "high" | "critical";

/**
 * How treatment activity is represented under an Issue.
 *
 * Phase 15 canonical implementation:
 *   - work — Work activity (backed by Maintenance persistence)
 *
 * Legacy:
 *   - incident_handling — existing Incident records only (do not create via Log Issue)
 *   - maintenance — deprecated alias for work (prefer "work")
 *
 * Work Order is EXECUTION — do not emit as treatment.
 */
export type IssueTreatmentKind =
  | "work"
  /**
   * @deprecated Prefer "work". Same backing store (Maintenance). Retained for older refs.
   */
  | "maintenance"
  /**
   * Legacy Incident records only. Not a current FM operating category.
   */
  | "incident_handling"
  /**
   * @deprecated Not a treatment. Use IssueExecutionRef / workOrders.
   */
  | "work_order"
  /**
   * @deprecated Reserved; not used by composers.
   */
  | "direct";

/**
 * A treatment activity linked to an Issue.
 * Backed by an existing domain record — never a duplicate row.
 */
export type IssueTreatmentRef = {
  kind: IssueTreatmentKind;
  /** Authoritative domain id (e.g. MNT-*, INC-*). */
  id: string;
  /** Authoritative domain status string — not remapped here. */
  status: string;
  title?: string;
  /** True when this treatment counts as successful terminal for Issue resolution. */
  isSuccessfullyTerminal: boolean;
  /** True when treatment is cancelled (not success). */
  isCancelled: boolean;
};

/**
 * Work Order related to an Issue (formal executable work = EXECUTION).
 * Distinct from Treatment: Issue = what needs attention; WO = formal execution instrument.
 */
export type IssueWorkOrderRef = {
  id: string;
  status: string;
  title?: string;
  /** Parent maintenance/incident that linked this WO, when known. */
  viaTreatmentId?: string;
  viaTreatmentKind?: Extract<
    IssueTreatmentKind,
    "work" | "maintenance" | "incident_handling"
  >;
};

/**
 * Formal executable work under an Issue.
 * work_order = implemented today (Annex approval may apply — OPEN gates).
 * job_order = future EVC/HQ + Procurement path — NOT implemented.
 */
export type IssueExecutionKind = "work_order" | "job_order";

/**
 * Conceptual approval association on an execution ref.
 * Do NOT treat as an implemented gate.
 * Client/NCC APR is a separate optional package — use client_ncc_package, never as hq_evc.
 */
export type IssueApprovalAuthority =
  /** Annex-level authorisation may be sufficient for WO path where applicable. */
  | "annex_director"
  /** HQ/EVC chain — Job Order path (future). */
  | "hq_evc"
  /** Existing optional Client Approval (APR) — commercial package, non-blocking today. */
  | "client_ncc_package"
  /** No authority claimed on this ref. */
  | "none"
  /**
   * @deprecated Phase 4 mislabel — do not use. Prefer annex_director | hq_evc | client_ncc_package.
   */
  | "hq_formal"
  /** @deprecated alias — use client_ncc_package */
  | "client_optional";

export type IssueExecutionRef = {
  kind: IssueExecutionKind;
  id: string;
  status: string;
  title?: string;
  /**
   * Conceptual only. Work Orders default to annex_director (not universal HQ).
   * Job Orders (future) use hq_evc. Never invent gates from this field.
   */
  approvalAuthority: IssueApprovalAuthority;
  viaTreatmentId?: string;
  viaTreatmentKind?: Extract<
    IssueTreatmentKind,
    "work" | "maintenance" | "incident_handling"
  >;
  /** True when this kind is documented but not implemented. */
  isFutureCapability?: boolean;
};

/** Conceptual outcome of Issue pursuit — derived, not stored. */
export type IssueOutcomeKind = "open" | "in_progress" | "resolved" | "cancelled";

export type IssueOutcome = {
  kind: IssueOutcomeKind;
  summary?: string;
  resolvedAt?: string;
  contributingTreatmentIds: string[];
};

/**
 * Conceptual FM actions. Only `available` actions are routable today.
 * `future` marks capabilities that must not be faked.
 * Resolve is not a required operator action — outcome follows authoritative terminals.
 */
export type IssueActionId =
  | "view"
  | "treat"
  | "resolve"
  | "cancel"
  | "investigate"
  | "create_work"
  | "view_treatment"
  | "view_related_work"
  | "log_issue";

export type IssueAction = {
  id: IssueActionId;
  label: string;
  available: boolean;
  /** Routes into an existing module workflow — never a duplicate form. */
  href?: string;
  description?: string;
  reasonUnavailable?: string;
  future?: boolean;
};

/**
 * Thin operational composition for UI / Intelligence readiness.
 * Not persisted.
 */
export type IssueOperationalView = {
  issue: Issue;
  outcome: IssueOutcome;
  executions: IssueExecutionRef[];
  actions: IssueAction[];
  /**
   * Explicit product/architecture limitations for this phase
   * (e.g. FM Log Issue without persistence).
   */
  limitations: string[];
};

/**
 * Application-level Issue view composed from authoritative domain records.
 * Not persisted as its own sheet/table.
 */
export type Issue = {
  /**
   * Stable application id for this composition.
   * - Request-backed: `issue:request:{REQ-*}`
   * - Maintenance-root: `issue:maintenance:{MNT-*}`
   * - Incident-root: `issue:incident:{INC-*}`
   */
  id: string;
  /** Public/staff-facing reference when intake is a Request (REQ-*). */
  reference: string;
  title: string;
  description?: string;
  source: IssueSource;
  reportedBy?: {
    userId?: string;
    name?: string;
    contact?: string;
  };
  locationDetail?: string;
  facilityId: string;
  assetId?: string;
  priority?: IssuePriority;
  classification?: IssueClassification;
  /**
   * Conceptual Issue status — DERIVED only from the authoritative root:
   * - issue:request:* → Request.status
   * - issue:maintenance:* → Maintenance.status
   * - issue:incident:* → Incident.status
   * Never written as a competing store.
   * OPEN: multi-root precedence when both MNT+INC exist without Request.
   */
  status: IssueStatus;
  /** Summary of treatment activity (derived). */
  treatmentState: {
    hasActiveTreatment: boolean;
    hasSuccessfulTreatment: boolean;
    treatmentCount: number;
  };
  /** Intake Request when source is staff_request. */
  relatedRequestId?: string;
  /** Root Maintenance id when Issue is `issue:maintenance:*`. */
  rootMaintenanceId?: string;
  /** Root Incident id when Issue is `issue:incident:*`. */
  rootIncidentId?: string;
  treatments: IssueTreatmentRef[];
  /** Linked Incident ids when Incident handling is present. */
  relatedIncidentIds: string[];
  /** Related Work Orders (execution), not treatments. */
  workOrders: IssueWorkOrderRef[];
  createdAt: string;
  updatedAt: string;
  resolvedAt?: string;
  resolutionSummary?: string;
};

/** Inputs for composing a Request-backed Issue. */
export type ComposeIssueFromRequestInput = {
  request: {
    id: string;
    title: string;
    description?: string;
    facilityId: string;
    locationDetail?: string;
    reporterName?: string;
    reporterContact?: string;
    reportedByUserId?: string;
    status: string;
    requestType?: string;
    maintenanceIds: string[];
    incidentIds: string[];
    workOrderIds: string[];
    createdAt: string;
    updatedAt: string;
  };
  maintenances?: Array<{
    id: string;
    title: string;
    status: string;
    priority?: string;
    assetId?: string;
    completedAt?: string;
    completionNotes?: string;
    workOrderId?: string;
    workOrderIds?: string[];
  } | null>;
  incidents?: Array<{
    id: string;
    title: string;
    status: string;
    type?: string;
    severity?: string;
    assetId?: string;
    resolvedAt?: string;
    resolutionNotes?: string;
    workOrderId?: string;
    workOrderIds?: string[];
  } | null>;
  workOrders?: Array<{
    id: string;
    title: string;
    status: string;
    maintenanceId?: string;
    incidentId?: string;
  } | null>;
};

/** Shared child shapes for FM root composition. */
export type ComposeIssueWorkOrderInput = {
  id: string;
  title: string;
  status: string;
  maintenanceId?: string;
  incidentId?: string;
};

/** FM Issue with Maintenance as authoritative root (no fake Request). */
export type ComposeIssueFromMaintenanceInput = {
  maintenance: {
    id: string;
    title: string;
    description?: string;
    facilityId: string;
    locationDetail?: string;
    status: string;
    priority?: string;
    assetId?: string;
    completedAt?: string;
    completionNotes?: string;
    workOrderId?: string;
    workOrderIds?: string[];
    sourceRequestId?: string;
    incidentId?: string;
    createdAt: string;
    updatedAt: string;
    createdByUserId?: string;
  };
  workOrders?: Array<ComposeIssueWorkOrderInput | null>;
  /** Optional linked Incident handling — not the root; specialised capability when present. */
  relatedIncident?: {
    id: string;
    title: string;
    status: string;
    type?: string;
    severity?: string;
  } | null;
};

/** FM Issue with Incident as authoritative root (no fake Request). */
export type ComposeIssueFromIncidentInput = {
  incident: {
    id: string;
    title: string;
    description?: string;
    facilityId: string;
    locationDetail?: string;
    status: string;
    type?: string;
    severity?: string;
    assetId?: string;
    resolvedAt?: string;
    resolutionNotes?: string;
    workOrderId?: string;
    workOrderIds?: string[];
    maintenanceIds?: string[];
    sourceRequestId?: string;
    createdAt: string;
    updatedAt: string;
    reportedByUserId?: string;
  };
  maintenances?: Array<{
    id: string;
    title: string;
    status: string;
    priority?: string;
    assetId?: string;
    completedAt?: string;
    workOrderId?: string;
    workOrderIds?: string[];
  } | null>;
  workOrders?: Array<ComposeIssueWorkOrderInput | null>;
};
