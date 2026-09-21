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
