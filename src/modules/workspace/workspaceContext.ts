/**
 * Phase 21+ — canonical Workspace / Command Surface operational context.
 *
 * LIVE: Issue → Work (/issues, /work)
 * LEGACY: historical Incident records (/incidents)
 *
 * Phase 26 — Critical Work vs Attention:
 *   Critical Work = pulse.criticalWork (isCriticalOpenWork KPI)
 *   Attention = buildAttentionModel cross-domain intervention queue
 */

export const WORKSPACE_OPERATIONAL_CONTEXT = {
  canonicalIssueSurface: "/issues",
  canonicalWorkSurface: "/work",
  canonicalWorkOrderSurface: "/work-orders",
  legacyIncidentSurface: "/incidents",
  /** Hero primary tile + Operational Picture — Work KPI only. */
  liveCriticalMetric: "criticalWork",
  liveOpenWorkMetric: "openWork",
  /** Attention queue severity — not the same as liveCriticalMetric. */
  attentionCriticalSeverityField: "attention.criticalCount",
  note: "Critical Work is the Work KPI (high/critical priority backlog). Attention is the broader cross-domain intervention queue.",
} as const;

export const WORKSPACE_INCIDENT_COMPAT = [
  "OrganisationalPulse.legacyOpenIncidents",
  "OrganisationalPulse.legacyCriticalIncidents",
  "activity feed legacy incident entries",
  "schedule legacy incident reported today",
  "deep links to /incidents for historical records",
] as const;

export const WORKSPACE_INCIDENT_RETARGET_PHASE = 21 as const;
export const WORKSPACE_CRITICAL_WORK_ALIGNMENT_PHASE = 26 as const;

/**
 * Home open work order count excludes draft (assigned/in-flow set).
 * Dashboard reporting KPI includes draft in open work orders.
 * See WORK_ORDER_OPEN_COUNT_NOTE in verify-command-surface-critical-work.mts.
 */
export const WORKSPACE_OPEN_WORK_ORDER_SCOPE = "assigned_in_flow_excludes_draft" as const;
