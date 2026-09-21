import type { WorkPriority, WorkStatus } from "@/lib/operational/work";
import type { MaintenanceSort } from "@/modules/maintenance/types";
import type { MaintenanceStatus } from "@/modules/maintenance/types";
import {
  MAINTENANCE_PRIORITIES,
  MAINTENANCE_STATUS_VARIANT,
  MAINTENANCE_PRIORITY_VARIANT,
  MAINTENANCE_SORT_OPTIONS,
  DEFAULT_MAINTENANCE_SORT,
  MAINTENANCE_ACTIVE_WORKFLOW_STATUSES,
  MAINTENANCE_STATUSES,
} from "@/modules/maintenance/constants";

/** Bounded Work list page size (Phase 16). */
export const WORK_PAGE_SIZE = 10;

export const WORK_STATUSES = MAINTENANCE_STATUSES as WorkStatus[];

/** Active / in-flight work — WIP scope (maps to list filter status=active). */
export const WORK_WIP_STATUSES =
  MAINTENANCE_ACTIVE_WORKFLOW_STATUSES as WorkStatus[];

/** Default Work list scope — active workflow rows only (not completed/cancelled). */
export const DEFAULT_WORK_LIST_STATUS = "active" as const;

export const WORK_PRIORITIES = MAINTENANCE_PRIORITIES as WorkPriority[];

export const WORK_STATUS_VARIANT = MAINTENANCE_STATUS_VARIANT;

export const WORK_PRIORITY_VARIANT = MAINTENANCE_PRIORITY_VARIANT;

export const WORK_SORT_OPTIONS = MAINTENANCE_SORT_OPTIONS;

export const DEFAULT_WORK_SORT: MaintenanceSort = DEFAULT_MAINTENANCE_SORT;

/**
 * Work is the DOMAIN; "In Progress" is one SCOPE over it. The default scope keeps the operational landing behaviour.
 * Scopes are a lens over the same register — never a second store, route or entity.
 */
export const WORK_SCOPES = [
  {
    value: "in_progress",
    label: "In Progress",
    description: "Work currently being handled across the facility.",
  },
  {
    value: "all",
    label: "All Work",
    description: "Current and historical Work recorded for the facility.",
  },
  {
    value: "completed",
    label: "Completed",
    description: "Work recorded as completed.",
  },
  {
    value: "cancelled",
    label: "Cancelled",
    description: "Work recorded as cancelled.",
  },
  {
    value: "not_recorded",
    label: "Status not recorded",
    description: "Historical Work where the source did not record a lifecycle status.",
  },
] as const;

export type WorkScope = (typeof WORK_SCOPES)[number]["value"];

export const DEFAULT_WORK_SCOPE: WorkScope = "in_progress";

export type WorkStatusRefinement = MaintenanceStatus | "all" | "active";

/** The status refinement that means "no refinement" within a scope. */
export function baseStatusForScope(scope: WorkScope): "active" | "all" {
  return scope === "in_progress" ? "active" : "all";
}

/**
 * The single translation from (scope, optional refinement) to the list `status` param. Scopes with a fixed lifecycle
 * (completed / cancelled / not recorded) ignore the refinement; In Progress only accepts in-flight statuses.
 */
export function effectiveWorkStatus(
  scope: WorkScope,
  refinement: WorkStatusRefinement
): WorkStatusRefinement {
  switch (scope) {
    case "completed":
      return "completed";
    case "cancelled":
      return "cancelled";
    case "not_recorded":
      return "unknown";
    case "in_progress":
      return (MAINTENANCE_ACTIVE_WORKFLOW_STATUSES as string[]).includes(refinement)
        ? refinement
        : "active";
    case "all":
    default:
      return refinement === "active" ? "all" : refinement;
  }
}
