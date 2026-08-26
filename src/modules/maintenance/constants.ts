import type {
  MaintenancePriority,
  MaintenanceSort,
  MaintenanceSource,
  MaintenanceStatus,
  MaintenanceType,
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
};

export const MAINTENANCE_PRIORITY_VARIANT: Record<
  MaintenancePriority,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
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
