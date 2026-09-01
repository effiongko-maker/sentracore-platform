/**
 * Universal operational Issue model — Phase 15 Work consolidation.
 *
 * Canonical chain:
 *   ISSUE → TREAT → WORK → EXECUTION (optional) → OUTCOME → COST / PAYMENT
 *
 * Work persistence (compatibility) = Maintenance sheet.
 * Incident = legacy compatibility domain — not a new FM category.
 * Issue = composed lens. No Issue sheet. No second status store.
 */

/** Ordered conceptual stages of operational pursuit. */
export const ISSUE_OPERATIONAL_CHAIN = [
  "issue",
  "treatment",
  "execution",
  "outcome",
  "cost_payment",
] as const;

export type IssueOperationalStage = (typeof ISSUE_OPERATIONAL_CHAIN)[number];

/**
 * Treatment implementations.
 * Canonical: work (Maintenance backing).
 * Legacy: incident_handling (existing records only).
 */
export const ISSUE_TREATMENT_IMPLEMENTATIONS = {
  work: {
    kind: "work" as const,
    implemented: true,
    mandatoryForIssues: false,
    backingStore: "maintenance" as const,
    note: "Work = treatment/action for an Issue. Physically backed by Maintenance persistence in Phase 15.",
  },
  maintenance: {
    kind: "maintenance" as const,
    implemented: true,
    mandatoryForIssues: false,
    deprecatedAliasFor: "work" as const,
    note: "Deprecated alias for work — same Maintenance backing store.",
  },
  incident_handling: {
    kind: "incident_handling" as const,
    implemented: true,
    mandatoryForIssues: false,
    legacy: true,
    note: "Legacy Incident records only. Not a current FM operating category. Do not create via Log Issue.",
  },
} as const;

/**
 * Execution implementations.
 * Work Order = formal scoped/authorised execution (optional).
 * Job Order = future — not implemented.
 */
export const ISSUE_EXECUTION_IMPLEMENTATIONS = {
  work_order: {
    kind: "work_order" as const,
    implemented: true,
    isTreatment: false,
    note: "Work Order is EXECUTION, not Work/Treatment.",
  },
  job_order: {
    kind: "job_order" as const,
    implemented: false,
    isTreatment: false,
    note: "Job Order remains unimplemented.",
  },
} as const;

/**
 * How an Issue composition is rooted (implementation identity).
 * `maintenance` root id = Work backing (MNT-*).
 * `incident` root = legacy only.
 */
export const ISSUE_ROOT_KINDS = [
  "request",
  "maintenance",
  "incident",
] as const;

export type IssueRootKind = (typeof ISSUE_ROOT_KINDS)[number];

/** Explicitly unresolved product/architecture decisions. */
export const ISSUE_MODEL_OPEN_DECISIONS = [
  "multi_root_status_precedence_when_work_and_legacy_incident",
  "work_wip_url_migration_from_maintenance",
  "incident_write_freeze_timeline",
  "mandatory_work_order_triggers",
  "full_job_order_approval_sequence",
  "payment_entity_naming_and_markup_rules",
  "whether_issue_sheet_is_ever_required",
] as const;

/**
 * FM Log Issue deferred side effects (Phase 9 — must not regress).
 * Critical path: auth → validate → Work create → compose view → response.
 */
export const FM_LOG_ISSUE_SIDE_EFFECT_MODE = "after" as const;
