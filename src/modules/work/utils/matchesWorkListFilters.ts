import { MAINTENANCE_ACTIVE_WORKFLOW_STATUSES } from "@/modules/maintenance/constants";
import type {
  Maintenance,
  MaintenancePriority,
  MaintenanceStatus,
} from "@/modules/maintenance/types";

type WorkListStatus = MaintenanceStatus | "all" | "active";

export type WorkListFilterState = {
  search: string;
  priority: MaintenancePriority | "all";
  status: WorkListStatus;
  facilityId: string | "all";
  assignedToUserId: string | "all";
  requiresWorkOrder: boolean | "all";
};

/** Mirror MaintenanceService.gs applyFilters_ semantics for client reconciliation. */
export function matchesWorkListFilters(
  row: Maintenance,
  filters: WorkListFilterState
): boolean {
  const search = filters.search.trim().toLowerCase();
  if (search) {
    const matchesSearch =
      String(row.title ?? "")
        .toLowerCase()
        .includes(search) ||
      String(row.id ?? "")
        .toLowerCase()
        .includes(search) ||
      String(row.description ?? "")
        .toLowerCase()
        .includes(search) ||
      String(row.facilityId ?? "")
        .toLowerCase()
        .includes(search) ||
      String(row.department ?? "")
        .toLowerCase()
        .includes(search) ||
      String(row.workOrderId ?? "")
        .toLowerCase()
        .includes(search) ||
      (row.workOrderIds ?? []).some((id) =>
        String(id).toLowerCase().includes(search)
      );
    if (!matchesSearch) return false;
  }

  if (
    filters.priority !== "all" &&
    String(row.priority).toLowerCase() !== filters.priority.toLowerCase()
  ) {
    return false;
  }

  if (filters.status === "active") {
    if (!MAINTENANCE_ACTIVE_WORKFLOW_STATUSES.includes(row.status)) {
      return false;
    }
  } else if (
    filters.status !== "all" &&
    row.status !== filters.status
  ) {
    return false;
  }

  if (
    filters.facilityId !== "all" &&
    row.facilityId !== filters.facilityId
  ) {
    return false;
  }

  if (
    filters.assignedToUserId !== "all" &&
    row.assignedToUserId !== filters.assignedToUserId
  ) {
    return false;
  }

  if (filters.requiresWorkOrder !== "all") {
    const hasWo = Boolean(
      row.requiresWorkOrder ||
        row.workOrderId ||
        (row.workOrderIds?.length ?? 0) > 0
    );
    if (hasWo !== filters.requiresWorkOrder) return false;
  }

  return true;
}
