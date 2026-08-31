import {
  isIncidentSuccessfullyTerminal,
  isMaintenanceSuccessfullyTerminal,
} from "@/lib/operational/orchestration/treatmentTerminals";
import type { IssueClassification, IssuePriority, IssueStatus } from "./types";

/** Re-export auto-resolution terminal helpers — single semantic source. */
export {
  isIncidentSuccessfullyTerminal,
  isMaintenanceSuccessfullyTerminal,
};

/**
 * Map authoritative Request.status → conceptual IssueStatus.
 * Request remains SoT for Track Request; this is a lens only.
 */
export function mapRequestStatusToIssueStatus(
  requestStatus: string
): IssueStatus {
  switch (requestStatus) {
    case "resolved":
    case "closed":
      return "resolved";
    case "cancelled":
      return "cancelled";
    case "being_treated":
    case "under_review":
      return "being_treated";
    case "submitted":
    default:
      return "reported";
  }
}

export function isMaintenanceCancelled(status: string): boolean {
  return status === "cancelled";
}

export function isIncidentCancelled(status: string): boolean {
  return status === "cancelled" || status === "closed";
}

/**
 * Map authoritative Maintenance.status → IssueStatus for FM ordinary roots.
 * OPEN: multi-treatment override when both MNT+INC exist without Request.
 */
export function mapMaintenanceStatusToIssueStatus(
  maintenanceStatus: string
): IssueStatus {
  switch (maintenanceStatus) {
    case "completed":
      return "resolved";
    case "cancelled":
      return "cancelled";
    case "requested":
      return "reported";
    case "triaged":
    case "scheduled":
    case "in_progress":
    case "on_hold":
    default:
      return "being_treated";
  }
}

/**
 * Map authoritative Incident.status → IssueStatus for FM significant roots.
 * OPEN: multi-treatment override when both MNT+INC exist without Request.
 */
export function mapIncidentStatusToIssueStatus(
  incidentStatus: string
): IssueStatus {
  switch (incidentStatus) {
    case "resolved":
    case "closed":
      return "resolved";
    case "cancelled":
      return "cancelled";
    case "reported":
      return "reported";
    case "triaged":
    case "investigating":
    case "contained":
    default:
      return "being_treated";
  }
}

export function mapSeverityToIssuePriority(
  severity?: string
): IssuePriority | undefined {
  if (
    severity === "low" ||
    severity === "medium" ||
    severity === "high" ||
    severity === "critical"
  ) {
    return severity;
  }
  return undefined;
}

/**
 * Map Incident type → Issue classification.
 * Incident remains an existing domain; classification is conceptual only.
 */
export function mapIncidentTypeToClassification(
  type?: string
): IssueClassification | undefined {
  switch (type) {
    case "safety":
    case "security":
      return "safety";
    case "utility_failure":
    case "service_request":
      return "service_disruption";
    case "equipment_failure":
      return "equipment_failure";
    case "environmental":
      return "environmental";
    case "observation":
    case "complaint":
      return "routine";
    case "other":
      return "other";
    default:
      return undefined;
  }
}

/** Prefer requestType hint when no Incident classification is present. */
export function classificationFromRequestType(
  requestType?: string
): IssueClassification | undefined {
  if (requestType === "incident") return "other";
  if (requestType === "maintenance") return "routine";
  return undefined;
}
