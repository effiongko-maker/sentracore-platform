import type {
  WorkOrderMaintenanceType,
  WorkOrderPriority,
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
