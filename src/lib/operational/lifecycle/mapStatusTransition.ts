import { OperationalEventTypes } from "@/lib/events/taxonomy";
import type { IncidentStatus } from "@/modules/incidents/types";
import type { MaintenanceStatus } from "@/modules/maintenance/types";
import type { WorkOrderStatus } from "@/modules/work-orders/types";

export type LifecycleEntityType = "incident" | "maintenance" | "work_order";

/**
 * Map a domain status change to a taxonomy lifecycle event.
 * Returns null when the transition is not a meaningful lifecycle fact
 * (no-op, already-represented terminal state, or unsupported status pair).
 *
 * Domain status names are used as-is — this does not invent statuses.
 * Incident "escalated" is represented by investigating / contained.
 * Maintenance "started" is represented by in_progress.
 * Work order "started" is represented by in_progress.
 */
export function mapStatusToLifecycleEvent(
  entityType: LifecycleEntityType,
  previousStatus: string | undefined | null,
  nextStatus: string | undefined | null
): string | null {
  const previous = (previousStatus ?? "").trim().toLowerCase();
  const next = (nextStatus ?? "").trim().toLowerCase();
  if (!next || previous === next) return null;

  if (entityType === "incident") {
    return mapIncidentStatus(previous, next as IncidentStatus);
  }
  if (entityType === "maintenance") {
    return mapMaintenanceStatus(previous, next as MaintenanceStatus);
  }
  return mapWorkOrderStatus(previous, next as WorkOrderStatus);
}

function mapIncidentStatus(
  previous: string,
  next: IncidentStatus
): string | null {
  switch (next) {
    case "triaged":
      return OperationalEventTypes.FACILITY_INCIDENT_TRIAGED;
    case "investigating":
    case "contained":
      // Already in an elevated handling state — do not emit a second escalation.
      if (previous === "investigating" || previous === "contained") {
        return null;
      }
      return OperationalEventTypes.FACILITY_INCIDENT_ESCALATED;
    case "resolved":
    case "closed":
      if (previous === "resolved" || previous === "closed") {
        return null;
      }
      return OperationalEventTypes.FACILITY_INCIDENT_RESOLVED;
    case "reported":
    case "cancelled":
    default:
      return null;
  }
}

function mapMaintenanceStatus(
  previous: string,
  next: MaintenanceStatus
): string | null {
  switch (next) {
    case "scheduled":
      return OperationalEventTypes.FACILITY_MAINTENANCE_SCHEDULED;
    case "in_progress":
      return OperationalEventTypes.FACILITY_MAINTENANCE_STARTED;
    case "completed":
      if (previous === "completed") return null;
      return OperationalEventTypes.FACILITY_MAINTENANCE_COMPLETED;
    case "requested":
    case "triaged":
    case "on_hold":
    case "cancelled":
    default:
      return null;
  }
}

function mapWorkOrderStatus(
  previous: string,
  next: WorkOrderStatus
): string | null {
  switch (next) {
    case "assigned":
      return OperationalEventTypes.FACILITY_WORK_ORDER_ASSIGNED;
    case "in_progress":
      return OperationalEventTypes.FACILITY_WORK_ORDER_STARTED;
    case "completed":
      if (previous === "completed" || previous === "closed") return null;
      return OperationalEventTypes.FACILITY_WORK_ORDER_COMPLETED;
    case "cancelled":
      if (previous === "cancelled") return null;
      return OperationalEventTypes.FACILITY_WORK_ORDER_CANCELLED;
    case "draft":
    case "open":
    case "on_hold":
    case "closed":
    default:
      return null;
  }
}

export function lifecycleEntityTypeLabel(
  entityType: LifecycleEntityType
): "incident" | "maintenance_request" | "work_order" {
  if (entityType === "incident") return "incident";
  if (entityType === "maintenance") return "maintenance_request";
  return "work_order";
}
