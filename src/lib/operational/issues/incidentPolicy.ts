/**
 * Incident policy guidance (Phase 6) — copy/routing hints only.
 * Does not hard-block existing Create/Link Incident capability.
 */

/** Significant-event Incident types (conceptual). Ordinary problems use Maintenance. */
export const SIGNIFICANT_INCIDENT_TYPES = [
  "safety",
  "security",
  "environmental",
  "utility_failure",
  "equipment_failure",
] as const;

export const INCIDENT_POLICY = {
  ordinaryDefault: "maintenance" as const,
  significantHandling: "incident_handling" as const,
  treatGuidance:
    "Ordinary facility problems: create or link Maintenance. Incident is for significant events requiring investigation, containment, escalation, or event-specific handling.",
  investigateGuidance:
    "Use Incident only for significant operational events (safety, security, flood/fire/environmental, major disruption, serious equipment failure). Do not use Incident as a second way to log ordinary facility problems.",
  createWorkGuidance:
    "Work Order is optional formal execution — not required for every treatment. Create a Work Order only when formal executable scope must be tracked separately. Job Orders are a future path (EVC/HQ + Procurement).",
} as const;

export function isSignificantIncidentType(type?: string): boolean {
  if (!type) return false;
  return (SIGNIFICANT_INCIDENT_TYPES as readonly string[]).includes(type);
}
