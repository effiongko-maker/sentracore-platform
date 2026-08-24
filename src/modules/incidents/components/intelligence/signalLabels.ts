/**
 * Presentation-only mapping of known intelligence signal keys → UI labels.
 * Does not alter the intelligence engine.
 */

const SIGNAL_LABELS: Record<string, string> = {
  "incident.facility_frequency_7d": "Recurring pattern",
  "incident.facility_frequency_30d": "Recurring pattern",
  "incident.repeated_type": "Similar incidents",
  "incident.repeated_severity": "Similar severity pattern",
  "incident.repeated_asset": "Similar incidents",
  "incident.repeated_location": "Similar incidents",
  "incident.recent_maintenance_at_facility": "Related operational signal",
  "incident.is_emergency": "Emergency",
  "incident.severity_critical": "Critical severity",
  "incident.severity_high": "High severity",
  "incident.requires_work_order": "Work order context",
  "recommendation.accepted": "Recommendation accepted",
  "recommendation.dismissed": "Recommendation dismissed",
  "recommendation.deferred": "Recommendation deferred",
  "recommendation.critical_risk_dismissed": "Critical-risk recommendation dismissed",
  "recommendation.high_risk_dismissed": "High-risk recommendation dismissed",
  "recommendation.critical_risk_deferred": "Critical-risk recommendation deferred",
  "recommendation.repeated_critical_dismissal":
    "Repeated dismissal of critical-risk guidance",
  "recommendation.repeated_critical_deferral":
    "Repeated deferral of critical-risk guidance",
  "recommendation.repeated_recommendation_acceptance":
    "Repeated acceptance of similar guidance",
  "recommendation.repeated_dismissal": "Repeated dismissal pattern",
};

/**
 * Human-readable label for a signal key. Never returns the raw key as primary copy.
 */
export function labelForSignalKey(key: string): string {
  const known = SIGNAL_LABELS[key];
  if (known) return known;

  const trimmed = key.trim();
  if (!trimmed) return "Operational signal";

  const lastSegment = trimmed.includes(".")
    ? (trimmed.split(".").pop() ?? trimmed)
    : trimmed;

  const words = lastSegment
    .split(/[_-]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase());

  if (words.length === 0) return "Operational signal";
  return words.join(" ");
}
