import type {
  MaintenancePriority,
  MaintenanceSort,
  MaintenanceSource,
  MaintenanceStatus,
  MaintenanceType,
  WorkCommercialRoute,
} from "./types";

export const MAINTENANCE_TYPES: MaintenanceType[] = [
  "preventive",
  "corrective",
  "inspection",
  "predictive",
  "routine",
  "other",
];

export const MAINTENANCE_STATUSES: MaintenanceStatus[] = [
  "requested",
  "triaged",
  "scheduled",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
];

/** Active workflow statuses — Completed/Cancelled are deliberate lifecycle actions. */
export const MAINTENANCE_ACTIVE_WORKFLOW_STATUSES: MaintenanceStatus[] = [
  "requested",
  "triaged",
  "scheduled",
  "in_progress",
  "on_hold",
];

export const MAINTENANCE_PRIORITIES: MaintenancePriority[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const MAINTENANCE_SOURCES: MaintenanceSource[] = [
  "manual",
  "event",
  "incident",
  "schedule",
  "request",
  "system",
];

export const MAINTENANCE_STATUS_VARIANT: Record<
  MaintenanceStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  requested: "info",
  triaged: "info",
  scheduled: "info",
  in_progress: "warning",
  on_hold: "warning",
  completed: "success",
  cancelled: "neutral",
  unknown: "neutral",
};

export const MAINTENANCE_PRIORITY_VARIANT: Record<
  MaintenancePriority,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
  unknown: "neutral",
};

export const MAINTENANCE_PAGE_SIZE = 8;

export const MAINTENANCE_SORT_OPTIONS: Array<{
  value: MaintenanceSort;
  label: string;
}> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title_asc", label: "Title: A–Z" },
  { value: "title_desc", label: "Title: Z–A" },
];

export const DEFAULT_MAINTENANCE_SORT: MaintenanceSort = "newest";

/** Execution basis options (fm_work.commercial_route). Order is presentation only — there is no default. */
export const WORK_COMMERCIAL_ROUTE_OPTIONS: Array<{
  value: WorkCommercialRoute;
  label: string;
  description: string;
}> = [
  {
    value: "work_order",
    label: "Work Order",
    description: "No prior client approval required",
  },
  {
    value: "job_order",
    label: "Job Order",
    description: "Client approval required before execution",
  },
];

export const WORK_COMMERCIAL_ROUTE_LABELS: Record<WorkCommercialRoute, string> = {
  work_order: "Work Order",
  job_order: "Job Order",
};
