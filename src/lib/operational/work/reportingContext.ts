/**
 * Phase 20 — canonical reporting operational context.
 *
 * LIVE FM reporting: Issue → Work (maintenance backing store) + Work Orders.
 * LEGACY: historical Incident records remain queryable for compatibility reports.
 */

export const REPORTING_OPERATIONAL_CONTEXT = {
  canonicalWorkSource: "maintenance",
  canonicalIssueSurface: "/issues",
  canonicalWorkSurface: "/work",
  legacyIncidentSurface: "/incidents",
  liveCriticalMetric: "criticalWork",
  legacyCriticalMetric: "criticalIncidents",
  note: "Live operational reporting uses Work; Incident KPIs are historical compatibility only.",
} as const;

/** Incident reporting paths retained for historical / incident_report type only. */
export const INCIDENT_REPORTING_COMPAT = [
  "ReportingSnapshot.incidents (historical register)",
  "incident_report document builder",
  "criticalIncidents KPI (legacy count)",
] as const;

export const INCIDENT_REPORTING_RETARGET_PHASE = 20 as const;
