export type MaintenanceType =
  | "preventive"
  | "corrective"
  | "inspection"
  | "predictive"
  | "routine"
  | "other";

export type MaintenanceStatus =
  | "requested"
  | "triaged"
  | "scheduled"
  | "in_progress"
  | "on_hold"
  | "completed"
  | "cancelled"
  /** Historical migrated Work only: lifecycle state not recorded in the source. Never selectable in the product. */
  | "unknown";

/** operational = created through the product (strict validation); migrated_historical = explicit migration. */
export type FmRecordOrigin = "operational" | "migrated_historical";

/** `unknown` = migrated historical Work whose source states no priority. Never selectable in the product. */
export type MaintenancePriority = "low" | "medium" | "high" | "critical" | "unknown";

export type MaintenanceSource =
  | "manual"
  | "event"
  | "incident"
  | "schedule"
  | "request"
  | "system";

/**
 * Execution basis (fm_work.commercial_route) — the route this Work follows. An explicit operator selection, never
 * inferred (not from amount, cost, Approval, Work Order / Job Order, status or facility).
 *   work_order : no prior client approval required (Work Order is raised after execution)
 *   job_order  : client approval required before execution (Job Order issued after approval)
 */
export type WorkCommercialRoute = "work_order" | "job_order";

export type MaintenanceSort =
  | "newest"
  | "oldest"
  | "title_asc"
  | "title_desc";

/** Canonical Maintenance domain model — frozen. Do not modify. */
export interface Maintenance {
  id: string;
  /** Canonical fm_work UUID for operational event linkage. */
  workUuid?: string;

  title: string;
  description?: string;
  /** Undefined when the source does not establish a Work type (e.g. migrated historical Work). Never defaulted. */
  type?: MaintenanceType;
  source: MaintenanceSource;
  categoryId?: string;
  department?: string;

  facilityId: string;
  /** Every facility the Work covers (primary first); a single-facility Work lists only facilityId. */
  facilityIds?: string[];
  assetId?: string;
  reportedByUserId?: string;
  assignedToUserId?: string;
  assignedGroupId?: string;
  /**
   * Supabase operational_events.id when recorded.
   * Sheet column: Event ID — not an Incident id.
   */
  operationalEventId?: string;
  /** @deprecated use operationalEventId */
  eventId?: string;
  incidentId?: string;
  workOrderId?: string;
  workOrderIds?: string[];
  parentMaintenanceId?: string;
  /** Optional parent intake Request (REQ-*). Phase 1: not auto-populated. */
  sourceRequestId?: string;

  priority: MaintenancePriority;
  status: MaintenanceStatus;
  holdReason?: string;
  requiresWorkOrder?: boolean;
  /** Execution basis. Undefined = legacy-unclassified Work (created before the route existed). Never inferred. */
  commercialRoute?: WorkCommercialRoute;
  /** Work-level client Approval (Job Order route) — code and status, derived through fm_approvals.work_id. */
  clientApprovalId?: string;
  clientApprovalStatus?: string;
  /** Codes of this Work's issued Job Orders (derived). */
  jobOrderIds?: string[];

  /** Undefined ONLY for migrated_historical Work whose reporting date is not in the source. */
  reportedAt?: string;
  /** operational (product-created, strict) | migrated_historical (explicit migration). Never set from input. */
  recordOrigin?: FmRecordOrigin;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  dueAt?: string;
  startedAt?: string;
  completedAt?: string;

  completionNotes?: string;
  workPerformed?: string;

  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export interface CreateMaintenanceInput {
  title: string;
  description?: string;
  type: MaintenanceType;
  source: MaintenanceSource;
  categoryId?: string;
  department?: string;
  facilityId: string;
  /** "Both": every facility the Work covers, primary first. Omit for a single facility. */
  facilityIds?: string[];
  assetId?: string;
  reportedByUserId?: string;
  assignedToUserId?: string;
  assignedGroupId?: string;
  eventId?: string;
  operationalEventId?: string;
  incidentId?: string;
  workOrderId?: string;
  workOrderIds?: string[];
  parentMaintenanceId?: string;
  sourceRequestId?: string;
  priority: MaintenancePriority;
  status: MaintenanceStatus;
  holdReason?: string;
  requiresWorkOrder?: boolean;
  /** Execution basis — optional at creation (an Issue has none until treated); never defaulted. */
  commercialRoute?: WorkCommercialRoute;
  reportedAt: string;
  scheduledStartAt?: string;
  scheduledEndAt?: string;
  dueAt?: string;
  startedAt?: string;
  completedAt?: string;
  completionNotes?: string;
  workPerformed?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateMaintenanceInput = Partial<CreateMaintenanceInput>;

export interface MaintenanceListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  priority?: MaintenancePriority | "all" | "high_or_critical";
  status?: MaintenanceStatus | "all" | "active";
  type?: MaintenanceType | "all";
  facilityId?: string | "all";
  assignedToUserId?: string | "all";
  requiresWorkOrder?: boolean | "all";
  sort?: MaintenanceSort;
  /**
   * Home-only: Apps Script returns exact active high|critical total on the
   * same getAll pass (criticalWorkTotal), counted before pagination.
   */
  includeCriticalWorkTotal?: boolean;
  /**
   * Home-only: complete-population Operational Picture totals from the same
   * getAll pass (no extra sheet read).
   */
  includeOperationalPictureTotals?: boolean;
  /** ISO-8601 UTC timestamp for overdue day comparison. */
  asOf?: string;
  /** Include Work imported from the 2025 registers (history). Default false: current operating picture only. */
  includeHistory?: boolean;
}

/** Lightweight reference row for filter dropdowns — id + title only. */
export interface MaintenanceCatalogEntry {
  id: string;
  title: string;
}

export interface MaintenanceCatalogListParams {
  page?: number;
  pageSize?: number;
  search?: string;
}

export type MaintenanceModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; maintenance: Maintenance }
  | { type: "view"; maintenance: Maintenance }
  | { type: "deactivate"; maintenance: Maintenance };
