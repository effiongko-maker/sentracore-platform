export type WorkOrderType =
  | "corrective"
  | "preventive"
  | "inspection"
  | "reactive"
  | "project"
  | "other";

export type WorkOrderStatus =
  | "draft"
  | "open"
  | "assigned"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled"
  | "closed";

export type WorkOrderPriority = "low" | "medium" | "high" | "critical";

export type WorkOrderSource =
  | "manual"
  | "preventive_schedule"
  | "incident"
  | "inspection"
  | "request"
  | "system";

export type WorkOrderMaintenanceType = "planned" | "unplanned";

/** Canonical WorkOrder domain model — frozen. Do not modify. */
export interface WorkOrder {
  id: string;

  title: string;
  description?: string;
  type: WorkOrderType;
  maintenanceType?: WorkOrderMaintenanceType;
  source: WorkOrderSource;
  categoryId?: string;
  workInstructions?: string;

  facilityId: string;
  assetId?: string;
  reportedByUserId?: string;
  incidentId?: string;
  maintenanceId?: string;
  parentWorkOrderId?: string;
  operationalEventId?: string;

  assignedToUserId?: string;
  assignedGroupId?: string;

  requestedAt?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  dueAt?: string;

  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  holdReason?: string;

  startedAt?: string;
  completedAt?: string;
  estimatedHours?: number;
  actualHours?: number;

  estimatedCost?: number;
  actualCost?: number;

  completionNotes?: string;
  workPerformed?: string;
  downtimeMinutes?: number;

  slaDueAt?: string;
  requiresApproval?: boolean;

  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export interface CreateWorkOrderInput {
  title: string;
  description?: string;
  type: WorkOrderType;
  maintenanceType?: WorkOrderMaintenanceType;
  source: WorkOrderSource;
  categoryId?: string;
  workInstructions?: string;
  facilityId: string;
  assetId?: string;
  reportedByUserId?: string;
  incidentId?: string;
  maintenanceId?: string;
  parentWorkOrderId?: string;
  operationalEventId?: string;
  assignedToUserId?: string;
  assignedGroupId?: string;
  requestedAt?: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  dueAt?: string;
  status: WorkOrderStatus;
  priority: WorkOrderPriority;
  holdReason?: string;
  startedAt?: string;
  completedAt?: string;
  estimatedHours?: number;
  actualHours?: number;
  estimatedCost?: number;
  actualCost?: number;
  completionNotes?: string;
  workPerformed?: string;
  downtimeMinutes?: number;
  slaDueAt?: string;
  requiresApproval?: boolean;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateWorkOrderInput = Partial<CreateWorkOrderInput>;

export type WorkOrderDueDateFilter =
  | "all"
  | "overdue"
  | "next_7_days"
  | "no_due";

export type WorkOrderSort =
  | "newest"
  | "oldest"
  | "title_asc"
  | "title_desc";

export interface WorkOrderListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: WorkOrderStatus | "all";
  priority?: WorkOrderPriority | "all";
  facilityId?: string | "all";
  assignedToUserId?: string | "all";
  type?: WorkOrderType | "all";
  assetId?: string | "all";
  maintenanceId?: string | "all";
  dueDate?: WorkOrderDueDateFilter;
  sort?: WorkOrderSort;
}

export type WorkOrderModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; workOrder: WorkOrder }
  | { type: "view"; workOrder: WorkOrder }
  | { type: "deactivate"; workOrder: WorkOrder };
