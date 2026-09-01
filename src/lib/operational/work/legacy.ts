/**
 * Incident operational domain — legacy compatibility boundary (Phase 18).
 *
 * Product decision: there is NO operational Maintenance-vs-Incident distinction.
 * Normal FM flows (Log Issue, Treat → Work) must not create new Incident records.
 *
 * Preserve: Incidents sheet, APIs, historical reads, Request auto-resolve for
 * existing Incident-linked Requests, WO incidentId links, Intelligence consumers.
 *
 * Do not delete. Do not migrate. Do not retarget Intelligence in Phase 18.
 */

export const INCIDENT_DOMAIN_LEGACY = {
  operationalCategory: false,
  newFmLogIssueCreatesIncident: false,
  newFmIncidentCreatesFrozen: true,
  treatCanonicalPath: "work" as const,
  historicalRecordsReadable: true,
  requestIncidentTerminalCompatible: true,
  intelligenceConsumersUntouched: true,
  primaryNavigationRetired: true,
  requestTreatmentIncidentUiRetired: true,
  primaryMaintenanceNavigationRetired: true,
  note: "Incident is a legacy compatibility domain, not a current FM operating category.",
} as const;

/**
 * Former FM creation paths — frozen at orchestration in Phase 18.
 * Underlying link/update APIs remain for historical compatibility.
 */
export const LEGACY_INCIDENT_CREATE_PATHS = [
  "reportIncident / Report event UI (/incidents) — FROZEN Phase 18",
  "orchestrateCreateIncidentFromRequest (Request Treat) — FROZEN Phase 18",
  "orchestrateReportIncident — FROZEN Phase 18",
] as const;

/** Orchestrators guarded by assertNewIncidentCreateAllowed (Phase 18). */
export const FROZEN_INCIDENT_CREATE_ORCHESTRATORS = [
  "orchestrateReportIncident",
  "orchestrateCreateIncidentFromRequest",
] as const;
