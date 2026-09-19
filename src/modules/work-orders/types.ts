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

/**
 * Explicit Order Type (Work Order vs Job Order).
 * Independent of Work Category (`type`) and of estimated/actual cost.
 */
export type WorkOrderOrderType = "work_order" | "job_order";

/** Canonical WorkOrder domain model. */
export interface WorkOrder {
  /** Display reference (WO-YYYY-######). Org-scoped, immutable. */
  id: string;
  /** Authoritative Supabase identity (fm_work_instructions.id). */
  workOrderUuid?: string;

  title: string;
  description?: string;
  type: WorkOrderType;
  /**
   * Persisted Order Type. Missing on legacy records → resolve as work_order.
   * Required on new create/update from the client.
   */
  orderType?: WorkOrderOrderType;
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
  /** Linked client approval request (APR-…). */
  approvalId?: string;

  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export interface CreateWorkOrderInput {
  title: string;
  description?: string;
  type: WorkOrderType;
  /** Required on create/update from the UI. */
  orderType: WorkOrderOrderType;
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
  approvalId?: string;
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
  includeOperationalPictureTotals?: boolean;
  asOf?: string;
}

/** Minimal rows for WO filter dropdowns (consolidated getFilterCatalog). */
export interface WorkOrderFilterCatalogFacility {
  id: string;
  name: string;
}

export interface WorkOrderFilterCatalogUser {
  id: string;
  name: string;
}

export interface WorkOrderFilterCatalogAsset {
  id: string;
  name: string;
  /** Facility UUID. */
  facilityId: string;
}

export interface WorkOrderFilterCatalog {
  facilities: WorkOrderFilterCatalogFacility[];
  users: WorkOrderFilterCatalogUser[];
  assets: WorkOrderFilterCatalogAsset[];
  serverTimings?: {
    facilitiesMs: number;
    usersMs: number;
    assetsMs: number;
    totalMs: number;
  };
  cacheDiagnostics?: {
    cacheHit: boolean;
    cacheReadMs: number;
    sheetReadMs: number;
    projectionMs: number;
    totalServerMs: number;
  };
}

export type WorkOrderModalState =
  | { type: "closed" }
  | { type: "create"; initialOrderType: WorkOrderOrderType }
  | { type: "edit"; workOrder: WorkOrder }
  | { type: "view"; workOrder: WorkOrder }
  | { type: "deactivate"; workOrder: WorkOrder };
