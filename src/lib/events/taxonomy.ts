/**
 * Operational event taxonomy (naming convention).
 *
 * ACTION NAMES (present-tense intent):  incident.report, maintenance.request
 * EVENT TYPES (past-tense facts):       <domain>.<past_tense_action>
 *
 * This catalog documents known types. Recording still accepts any valid text
 * event_type — do not hardcode module logic into the insert path.
 */

export const OperationalEventTypes = {
  FACILITY_INCIDENT_REPORTED: "facility.incident_reported",
  FACILITY_MAINTENANCE_REQUESTED: "facility.maintenance_requested",
  SYSTEM_RECOMMENDATION_DECIDED: "system.recommendation_decided",
} as const;

export type KnownOperationalEventType =
  (typeof OperationalEventTypes)[keyof typeof OperationalEventTypes];

export type OperationalEventTypeDefinition = {
  eventType: string;
  domain: string;
  description: string;
  /** Suggested polymorphic entity_type when emitting. */
  defaultEntityType?: string;
};

export const OPERATIONAL_EVENT_CATALOG: OperationalEventTypeDefinition[] = [
  {
    eventType: OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
    domain: "facility",
    description: "An incident was reported in Operations Management.",
    defaultEntityType: "incident",
  },
  {
    eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
    domain: "facility",
    description: "A maintenance request was created in Operations Management.",
    defaultEntityType: "maintenance_request",
  },
  {
    eventType: OperationalEventTypes.SYSTEM_RECOMMENDATION_DECIDED,
    domain: "system",
    description:
      "A human recorded a decision on an Action Engine recommendation.",
    defaultEntityType: "recommendation_decision",
  },
];

export function getEventTypeDefinition(
  eventType: string
): OperationalEventTypeDefinition | undefined {
  return OPERATIONAL_EVENT_CATALOG.find((entry) => entry.eventType === eventType);
}

export function isKnownEventType(eventType: string): boolean {
  return OPERATIONAL_EVENT_CATALOG.some((entry) => entry.eventType === eventType);
}
