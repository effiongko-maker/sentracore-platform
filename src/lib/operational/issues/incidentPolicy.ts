/**
 * Treatment-path guidance — Phase 15.
 * Canonical path: Treat → Work. Incident is legacy compatibility only.
 */

/** @deprecated Not used for Log Issue classification. */
export const SIGNIFICANT_INCIDENT_TYPES = [
  "safety",
  "security",
  "environmental",
  "utility_failure",
  "equipment_failure",
] as const;

export const INCIDENT_POLICY = {
  /** Canonical Treat path: Work (Maintenance sheet as temporary backing store). */
  ordinaryDefault: "work" as const,
  /** @deprecated Legacy Incident path — not used for new FM Log Issue. */
  significantHandling: "incident_handling" as const,
  incidentMandatoryForIssues: false as const,
  treatGuidance: "Start or continue work on this Issue.",
  investigateGuidance:
    "Legacy investigation records remain accessible; new Issues use Treat → Work.",
  createWorkGuidance:
    "Work Order is optional formal execution — not Work itself. Create a Work Order only when formal executable scope must be tracked separately.",
} as const;

export function isSignificantIncidentType(type?: string): boolean {
  if (!type) return false;
  return (SIGNIFICANT_INCIDENT_TYPES as readonly string[]).includes(type);
}
