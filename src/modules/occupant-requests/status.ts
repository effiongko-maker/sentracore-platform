import type { Incident, IncidentStatus } from "@/modules/incidents/types";
import type {
  Maintenance,
  MaintenanceStatus,
} from "@/modules/maintenance/types";
import type { RequestRecord, RequestStatus } from "@/modules/requests/types";
import type { OccupantRequestStatus } from "./types";

/**
 * Maps Request lifecycle statuses onto the occupant-facing confirmation labels.
 */
export function mapRequestToOccupantStatus(
  row: Pick<RequestRecord, "status">
): OccupantRequestStatus {
  const status = row.status as RequestStatus;

  if (status === "resolved") return "completed";
  if (status === "closed" || status === "cancelled") return "closed";
  if (status === "being_treated") return "in_progress";
  if (status === "under_review") return "assigned";
  return "submitted";
}

/**
 * Maps canonical Maintenance statuses onto the occupant-facing lifecycle.
 * Retained for any non-intake callers; intake no longer creates Maintenance.
 */
export function mapMaintenanceToOccupantStatus(
  row: Pick<Maintenance, "status" | "assignedToUserId">
): OccupantRequestStatus {
  const status = row.status as MaintenanceStatus;

  if (status === "completed") return "completed";
  if (status === "cancelled") return "closed";
  if (status === "in_progress" || status === "on_hold") return "in_progress";

  if (
    row.assignedToUserId &&
    (status === "requested" ||
      status === "triaged" ||
      status === "scheduled")
  ) {
    return "assigned";
  }

  return "submitted";
}

/**
 * Maps canonical Incident statuses onto the occupant-facing lifecycle.
 * Retained for any non-intake callers; intake no longer creates Incidents.
 */
export function mapIncidentToOccupantStatus(
  row: Pick<Incident, "status" | "assignedToUserId">
): OccupantRequestStatus {
  const status = row.status as IncidentStatus;

  if (status === "closed" || status === "cancelled") return "closed";
  if (status === "resolved") return "completed";
  if (status === "investigating" || status === "contained") {
    return "in_progress";
  }

  if (
    row.assignedToUserId &&
    (status === "reported" || status === "triaged")
  ) {
    return "assigned";
  }

  return "submitted";
}
