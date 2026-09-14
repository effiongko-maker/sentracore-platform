import type {
  WorkOrderDueDateFilter,
  WorkOrderMaintenanceType,
  WorkOrderPriority,
  WorkOrderSort,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
} from "./types";

export const WORK_ORDER_TYPES: WorkOrderType[] = [
  "corrective",
  "preventive",
  "inspection",
  "reactive",
  "project",
  "other",
];

export const WORK_ORDER_MAINTENANCE_TYPES: WorkOrderMaintenanceType[] = [
  "planned",
  "unplanned",
];

export const WORK_ORDER_SOURCES: WorkOrderSource[] = [
  "manual",
  "preventive_schedule",
  "incident",
  "inspection",
  "request",
  "system",
];

export const WORK_ORDER_STATUSES: WorkOrderStatus[] = [
  "draft",
  "open",
  "assigned",
  "in_progress",
  "on_hold",
  "completed",
  "cancelled",
  "closed",
];

export const WORK_ORDER_PRIORITIES: WorkOrderPriority[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const WORK_ORDER_STATUS_VARIANT: Record<
  WorkOrderStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  draft: "neutral",
  open: "info",
  assigned: "info",
  in_progress: "warning",
  on_hold: "warning",
  completed: "success",
  cancelled: "neutral",
  closed: "success",
};

export const WORK_ORDER_PRIORITY_VARIANT: Record<
  WorkOrderPriority,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const WORK_ORDERS_PAGE_SIZE = 8;

/** Client-side Order Type scope on the WIP register (not a persisted field). */
export type WorkOrderOrderTypeScope = "all" | "work_order" | "job_order";

export const WORK_ORDER_ORDER_TYPE_SCOPE_OPTIONS: Array<{
  value: WorkOrderOrderTypeScope;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "work_order", label: "Work Orders" },
  { value: "job_order", label: "Job Orders" },
];

/**
 * When scoping by derived Order Type, load a bounded window then paginate
 * client-side. Classification remains resolveWorkInstructionKind(orderType).
 */
export const WORK_ORDER_ORDER_TYPE_SCOPE_FETCH_SIZE = 500;

export const WORK_ORDER_SORT_OPTIONS: Array<{
  value: WorkOrderSort;
  label: string;
}> = [
  { value: "newest", label: "Newest" },
  { value: "oldest", label: "Oldest" },
  { value: "title_asc", label: "Title: A–Z" },
  { value: "title_desc", label: "Title: Z–A" },
];

export const DEFAULT_WORK_ORDER_SORT: WorkOrderSort = "newest";

export const WORK_ORDER_DUE_DATE_OPTIONS: Array<{
  value: WorkOrderDueDateFilter;
  label: string;
}> = [
  { value: "all", label: "All due dates" },
  { value: "overdue", label: "Overdue" },
  { value: "next_7_days", label: "Due in next 7 days" },
  { value: "no_due", label: "No due date" },
];
