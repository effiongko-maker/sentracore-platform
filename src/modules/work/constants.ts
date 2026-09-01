import type { WorkPriority, WorkStatus } from "@/lib/operational/work";
import type { MaintenanceSort } from "@/modules/maintenance/types";
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

/** Active / in-flight work — WIP scope. */
export const WORK_WIP_STATUSES =
  MAINTENANCE_ACTIVE_WORKFLOW_STATUSES as WorkStatus[];

export const WORK_PRIORITIES = MAINTENANCE_PRIORITIES as WorkPriority[];

export const WORK_STATUS_VARIANT = MAINTENANCE_STATUS_VARIANT;

export const WORK_PRIORITY_VARIANT = MAINTENANCE_PRIORITY_VARIANT;

export const WORK_SORT_OPTIONS = MAINTENANCE_SORT_OPTIONS;

export const DEFAULT_WORK_SORT: MaintenanceSort = DEFAULT_MAINTENANCE_SORT;

export type WorkListScope = "wip" | "all" | "completed";
