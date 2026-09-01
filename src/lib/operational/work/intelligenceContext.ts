/**
 * Phase 19 — canonical Intelligence operational context.
 *
 * NEW FM activity: Issue → Work (facility.maintenance_requested events).
 * LEGACY: historical Incident records (facility.incident_reported events).
 */

export const INTELLIGENCE_OPERATIONAL_CONTEXT = {
  canonicalRootEvent: "facility.maintenance_requested",
  canonicalEntity: "work",
  canonicalIssueSurface: "/issues",
  canonicalWorkSurface: "/work",
  legacyIncidentEvent: "facility.incident_reported",
  legacyIncidentSurface: "/incidents",
  note: "Intelligence reasons about Work for new activity; Incident events are historical compatibility input.",
} as const;

/** Incident event consumers retained for historical replay — not canonical FM path. */
export const INCIDENT_INTELLIGENCE_COMPAT_CONSUMERS = [
  "facility.analyze_incident_signals (incident_reported branch)",
  "facility.assess_incident_risk (incident_reported branch)",
  "facility.generate_incident_recommendations (incident_reported branch)",
] as const;
