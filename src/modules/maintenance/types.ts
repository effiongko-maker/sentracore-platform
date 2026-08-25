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
  | "cancelled";

export type MaintenancePriority = "low" | "medium" | "high" | "critical";

export type MaintenanceSource =
  | "manual"
  | "event"
  | "incident"
  | "schedule"
  | "request"
  | "system";

/** Canonical Maintenance domain model — frozen. Do not modify. */
export interface Maintenance {
  id: string;

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
  priority?: MaintenancePriority | "all";
  status?: MaintenanceStatus | "all";
  type?: MaintenanceType | "all";
  facilityId?: string | "all";
  assignedToUserId?: string | "all";
  requiresWorkOrder?: boolean | "all";
}

export type MaintenanceModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; maintenance: Maintenance }
  | { type: "view"; maintenance: Maintenance }
  | { type: "deactivate"; maintenance: Maintenance };
