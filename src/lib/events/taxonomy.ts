/**
 * Operational event taxonomy (naming convention).
 *
 * ACTION NAMES (present-tense intent):  incident.report, maintenance.request
 * EVENT TYPES (past-tense facts):       <domain>.<past_tense_action>
 */

export const OperationalEventTypes = {
  FACILITY_INCIDENT_REPORTED: "facility.incident_reported",
  FACILITY_INCIDENT_TRIAGED: "facility.incident_triaged",
  FACILITY_INCIDENT_ESCALATED: "facility.incident_escalated",
  FACILITY_INCIDENT_RESOLVED: "facility.incident_resolved",
  FACILITY_MAINTENANCE_REQUESTED: "facility.maintenance_requested",
  FACILITY_MAINTENANCE_SCHEDULED: "facility.maintenance_scheduled",
  FACILITY_MAINTENANCE_STARTED: "facility.maintenance_started",
  FACILITY_MAINTENANCE_COMPLETED: "facility.maintenance_completed",
  FACILITY_WORK_ORDER_CREATED: "facility.work_order_created",
  FACILITY_WORK_ORDER_ASSIGNED: "facility.work_order_assigned",
  FACILITY_WORK_ORDER_STARTED: "facility.work_order_started",
  FACILITY_WORK_ORDER_COMPLETED: "facility.work_order_completed",
  FACILITY_WORK_ORDER_CANCELLED: "facility.work_order_cancelled",
  FACILITY_WORK_ORDER_REASSIGNED: "facility.work_order_reassigned",
  FACILITY_MAINTENANCE_LINKED_TO_WORK_ORDER:
    "facility.maintenance_linked_to_work_order",
  FACILITY_APPROVAL_CREATED: "facility.approval_created",
  FACILITY_APPROVAL_SUBMITTED: "facility.approval_submitted",
  FACILITY_APPROVAL_FOLLOWED_UP: "facility.approval_followed_up",
  FACILITY_APPROVAL_APPROVED: "facility.approval_approved",
  FACILITY_APPROVAL_PARTIALLY_APPROVED: "facility.approval_partially_approved",
  FACILITY_APPROVAL_REJECTED: "facility.approval_rejected",
  FACILITY_APPROVAL_CANCELLED: "facility.approval_cancelled",
  SYSTEM_RECOMMENDATION_DECIDED: "system.recommendation_decided",
} as const;

export type KnownOperationalEventType =
  (typeof OperationalEventTypes)[keyof typeof OperationalEventTypes];

export type OperationalEventTypeDefinition = {
  eventType: string;
  domain: string;
  description: string;
  defaultEntityType?: string;
};

export const OPERATIONAL_EVENT_CATALOG: OperationalEventTypeDefinition[] = [
  {
    eventType: OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
    domain: "facility",
    description: "An incident was reported.",
    defaultEntityType: "incident",
  },
  {
    eventType: OperationalEventTypes.FACILITY_INCIDENT_TRIAGED,
    domain: "facility",
    description: "An incident was triaged.",
    defaultEntityType: "incident",
  },
  {
    eventType: OperationalEventTypes.FACILITY_INCIDENT_ESCALATED,
    domain: "facility",
    description: "An incident was escalated.",
    defaultEntityType: "incident",
  },
  {
    eventType: OperationalEventTypes.FACILITY_INCIDENT_RESOLVED,
    domain: "facility",
    description: "An incident was resolved.",
    defaultEntityType: "incident",
  },
  {
    eventType: OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
    domain: "facility",
    description: "A maintenance activity was requested.",
    defaultEntityType: "maintenance_request",
  },
  {
    eventType: OperationalEventTypes.FACILITY_MAINTENANCE_SCHEDULED,
    domain: "facility",
    description: "Maintenance was scheduled.",
    defaultEntityType: "maintenance_request",
  },
  {
    eventType: OperationalEventTypes.FACILITY_MAINTENANCE_STARTED,
    domain: "facility",
    description: "Maintenance work started.",
    defaultEntityType: "maintenance_request",
  },
  {
    eventType: OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED,
    domain: "facility",
    description: "Maintenance was completed.",
    defaultEntityType: "maintenance_request",
  },
  {
    eventType: OperationalEventTypes.FACILITY_WORK_ORDER_CREATED,
    domain: "facility",
    description: "A work order was created.",
    defaultEntityType: "work_order",
  },
  {
    eventType: OperationalEventTypes.FACILITY_WORK_ORDER_ASSIGNED,
    domain: "facility",
    description: "A work order was assigned.",
    defaultEntityType: "work_order",
  },
  {
    eventType: OperationalEventTypes.FACILITY_WORK_ORDER_STARTED,
    domain: "facility",
    description: "Work order execution started.",
    defaultEntityType: "work_order",
  },
  {
    eventType: OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED,
    domain: "facility",
    description: "A work order was completed.",
    defaultEntityType: "work_order",
  },
  {
    eventType: OperationalEventTypes.FACILITY_WORK_ORDER_CANCELLED,
    domain: "facility",
    description: "A work order was cancelled.",
    defaultEntityType: "work_order",
  },
  {
    eventType: OperationalEventTypes.FACILITY_WORK_ORDER_REASSIGNED,
    domain: "facility",
    description: "A work order was reassigned to a different person.",
    defaultEntityType: "work_order",
  },
  {
    eventType: OperationalEventTypes.FACILITY_MAINTENANCE_LINKED_TO_WORK_ORDER,
    domain: "facility",
    description: "Maintenance was linked to a work order.",
    defaultEntityType: "maintenance_request",
  },
  {
    eventType: OperationalEventTypes.FACILITY_APPROVAL_CREATED,
    domain: "facility",
    description: "A client approval request was created.",
    defaultEntityType: "approval",
  },
  {
    eventType: OperationalEventTypes.FACILITY_APPROVAL_SUBMITTED,
    domain: "facility",
    description: "A client approval request was submitted.",
    defaultEntityType: "approval",
  },
  {
    eventType: OperationalEventTypes.FACILITY_APPROVAL_FOLLOWED_UP,
    domain: "facility",
    description: "A follow-up was recorded on an outstanding approval.",
    defaultEntityType: "approval",
  },
  {
    eventType: OperationalEventTypes.FACILITY_APPROVAL_APPROVED,
    domain: "facility",
    description: "A client approval request was approved.",
    defaultEntityType: "approval",
  },
  {
    eventType: OperationalEventTypes.FACILITY_APPROVAL_PARTIALLY_APPROVED,
    domain: "facility",
    description: "A client approval request was partially approved.",
    defaultEntityType: "approval",
  },
  {
    eventType: OperationalEventTypes.FACILITY_APPROVAL_REJECTED,
    domain: "facility",
    description: "A client approval request was rejected.",
    defaultEntityType: "approval",
  },
  {
    eventType: OperationalEventTypes.FACILITY_APPROVAL_CANCELLED,
    domain: "facility",
    description: "A client approval request was cancelled.",
    defaultEntityType: "approval",
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

/**
 * Operational lifecycle events Intelligence should observe for patterns /
 * What Changed (period comparison) — not a raw activity feed.
 * Approvals + reassignment/link events are included so detectors can grow
 * without inventing a second event plane.
 */
export const OPERATIONAL_LIFECYCLE_EVENT_TYPES = [
  OperationalEventTypes.FACILITY_INCIDENT_REPORTED,
  OperationalEventTypes.FACILITY_INCIDENT_TRIAGED,
  OperationalEventTypes.FACILITY_INCIDENT_ESCALATED,
  OperationalEventTypes.FACILITY_INCIDENT_RESOLVED,
  OperationalEventTypes.FACILITY_MAINTENANCE_REQUESTED,
  OperationalEventTypes.FACILITY_MAINTENANCE_SCHEDULED,
  OperationalEventTypes.FACILITY_MAINTENANCE_STARTED,
  OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED,
  OperationalEventTypes.FACILITY_MAINTENANCE_LINKED_TO_WORK_ORDER,
  OperationalEventTypes.FACILITY_WORK_ORDER_CREATED,
  OperationalEventTypes.FACILITY_WORK_ORDER_ASSIGNED,
  OperationalEventTypes.FACILITY_WORK_ORDER_REASSIGNED,
  OperationalEventTypes.FACILITY_WORK_ORDER_STARTED,
  OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED,
  OperationalEventTypes.FACILITY_WORK_ORDER_CANCELLED,
  OperationalEventTypes.FACILITY_APPROVAL_CREATED,
  OperationalEventTypes.FACILITY_APPROVAL_SUBMITTED,
  OperationalEventTypes.FACILITY_APPROVAL_FOLLOWED_UP,
  OperationalEventTypes.FACILITY_APPROVAL_APPROVED,
  OperationalEventTypes.FACILITY_APPROVAL_PARTIALLY_APPROVED,
  OperationalEventTypes.FACILITY_APPROVAL_REJECTED,
  OperationalEventTypes.FACILITY_APPROVAL_CANCELLED,
] as const;
