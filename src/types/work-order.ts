/**
 * Re-export Work Orders module types for shared consumers.
 * Prefer importing from `@/modules/work-orders` within the feature.
 */
export type {
  CreateWorkOrderInput,
  UpdateWorkOrderInput,
  WorkOrder,
  WorkOrderListParams,
  WorkOrderMaintenanceType,
  WorkOrderPriority,
  WorkOrderSource,
  WorkOrderStatus,
  WorkOrderType,
} from "@/modules/work-orders/types";

export {
  WORK_ORDER_MAINTENANCE_TYPES,
  WORK_ORDER_PRIORITIES,
  WORK_ORDER_SOURCES,
  WORK_ORDER_STATUSES,
  WORK_ORDER_TYPES,
} from "@/modules/work-orders/constants";
