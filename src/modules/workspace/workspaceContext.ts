/**
 * Phase 21 — canonical Workspace / Command Surface operational context.
 *
 * LIVE: Issue → Work (/issues, /work)
 * LEGACY: historical Incident records (/incidents)
 */

export const WORKSPACE_OPERATIONAL_CONTEXT = {
  canonicalIssueSurface: "/issues",
  canonicalWorkSurface: "/work",
  canonicalWorkOrderSurface: "/work-orders",
  legacyIncidentSurface: "/incidents",
  liveCriticalMetric: "criticalWork",
  liveOpenWorkMetric: "openWork",
  note: "Workspace pulse and attention use Work for live ops; Incident counts are legacy compatibility only.",
} as const;

export const WORKSPACE_INCIDENT_COMPAT = [
  "OrganisationalPulse.legacyOpenIncidents",
  "OrganisationalPulse.legacyCriticalIncidents",
  "activity feed legacy incident entries",
  "schedule legacy incident reported today",
  "deep links to /incidents for historical records",
] as const;

export const WORKSPACE_INCIDENT_RETARGET_PHASE = 21 as const;
