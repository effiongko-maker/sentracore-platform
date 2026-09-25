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
  | "closed"
  /** Historical migrated Work Instruction only: lifecycle not recorded in the source. Never selectable in the product. */
  | "unknown";

export type FmRecordOrigin = "operational" | "migrated_historical";

/** `unknown` = migrated historical Work Instruction whose source states no priority. Never selectable in the product. */
export type WorkOrderPriority = "low" | "medium" | "high" | "critical" | "unknown";

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

/** Commercial submission status (client payments vocabulary). */
export type WorkOrderSubmissionStatus = "draft" | "submitted";

export const WORK_ORDER_SUBMISSION_STATUS_LABELS: Record<WorkOrderSubmissionStatus, string> = {
  draft: "Draft — not yet submitted",
  submitted: "Submitted",
};

export interface CreateWorkOrderSubmissionInput {
  orderType: WorkOrderOrderType;
  title: string;
  /** Primary first; more than one = the WO/JO covers several facilities ("Both"). */
  facilityIds: string[];
  submissionDate?: string | null;
  submissionAmount?: number | null;
  submissionStatus: WorkOrderSubmissionStatus;
  /** Optional Works submitted together in this WO/JO (codes). */
  workIds?: string[];
}

export interface CommercialFollowUp {
  id: string;
  followedUpAt: string;
  method: "phone" | "email" | "physical_visit" | "client_portal" | "other";
  contactPerson?: string;
  outcomeNotes: string;
  nextFollowUpAt?: string;
  actorProfileId?: string;
}

export interface RecordCommercialFollowUpInput {
  followedUpAt: string;
  method: CommercialFollowUp["method"];
  contactPerson?: string;
  outcomeNotes: string;
  nextFollowUpAt?: string;
}

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
  /** operational (product-created, strict) | migrated_historical. Never set from input. */
  recordOrigin?: FmRecordOrigin;
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
  /** The client's own reference for an issued Job Order, as supplied. */
  clientReference?: string;
  /** The Work's execution basis (derived). Undefined for legacy-unclassified Work. */
  workCommercialRoute?: WorkOrderOrderType;
  /** The active Client Payment (payment request) raised for this Work Order — derived; receipts live there. */
  clientPaymentId?: string;

  /**
   * Commercial submission facts — a WO/JO is a commercial/payment submission package (0..many Works).
   * Date the WO/JO was submitted to the client.
   */
  submissionDate?: string;
  /** Amount submitted (commercial value) — never a cost and never spend. */
  submissionAmount?: number;
  /** recorded = entered on the WO/JO; imported_order_register = stated by the imported order-register source row. */
  submissionAmountSource?: "recorded";
  /** Execution expenditure from the source Cost column; already included in the cost register. */
  executionCost?: number;
  /** draft | submitted | queried. Undefined = not recorded (legacy / imported). Follow-ups are events, not statuses. */
  submissionStatus?: WorkOrderSubmissionStatus;
  /** Most recent recorded follow-up (never implies payment). */
  lastFollowUpAt?: string;
  /** Codes of every Work this WO/JO submits (may be empty). */
  linkedWorkIds?: string[];
  /** Every facility the WO/JO covers — primary first (e.g. both NCC Annex and CSIRT). */
  facilityIds?: string[];

  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export interface CreateWorkOrderInput {
  title: string;
  description?: string;
  type: WorkOrderType;
  /** Explicit selection for legacy-unclassified Work; derived from the Work's execution basis when classified. */
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
  approvalId?: string;
  clientReference?: string;
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
  /** Include WO/JO imported from the 2025 registers (history). Default false: current operating picture only. */
  includeHistory?: boolean;
  /** Only Work Orders or only Job Orders (the WO / JO tabs). */
  orderType?: WorkOrderOrderType | "all";
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
  /** Catalogs that could not be loaded. Their arrays are NOT healthy empty lists. */
  failed?: Array<"facilities" | "users" | "assets">;
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
