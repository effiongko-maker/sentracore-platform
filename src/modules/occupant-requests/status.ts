import type { Incident, IncidentStatus } from "@/modules/incidents/types";
import type {
  Maintenance,
  MaintenanceStatus,
} from "@/modules/maintenance/types";
import type { OccupantRequestStatus } from "./types";

/**
 * Maps canonical Maintenance statuses onto the occupant-facing lifecycle.
 * Does not alter domain enums.
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
 * Does not alter domain enums.
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
