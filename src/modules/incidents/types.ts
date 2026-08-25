export type IncidentType =
  | "equipment_failure"
  | "safety"
  | "security"
  | "utility_failure"
  | "environmental"
  | "observation"
  | "service_request"
  | "complaint"
  | "other";

export type IncidentSeverity = "low" | "medium" | "high" | "critical";

export type IncidentStatus =
  | "reported"
  | "triaged"
  | "investigating"
  | "contained"
  | "resolved"
  | "closed"
  | "cancelled";

export type IncidentSource =
  | "manual"
  | "technician"
  | "sensor"
  | "tenant"
  | "security"
  | "system"
  | "external";

export type IncidentChannel =
  | "portal"
  | "mobile"
  | "phone"
  | "email"
  | "radio"
  | "walk_in"
  | "system"
  | "other";

/** Canonical Incident domain model — frozen. Do not modify. */
export interface Incident {
  id: string;

  title: string;
  description?: string;
  type: IncidentType;
  source: IncidentSource;
  categoryId?: string;

  facilityId: string;
  assetId?: string;
  locationDetail?: string;
  reportedByUserId?: string;
  assignedToUserId?: string;
  assignedGroupId?: string;
  /** Primary linked work order (first of workOrderIds). */
  workOrderId?: string;
  /** Durable cross-entity links persisted on sheet. */
  workOrderIds?: string[];
  maintenanceIds?: string[];
  parentIncidentId?: string;
  /** Supabase operational_events.id when recorded. */
  operationalEventId?: string;

  reportedAt: string;
  discoveredAt?: string;
  reportedVia?: IncidentChannel;

  severity: IncidentSeverity;
  peopleAffected?: number;
  isEmergency?: boolean;

  status: IncidentStatus;
  holdReason?: string;
  requiresWorkOrder?: boolean;

  acknowledgedAt?: string;
  responseDueAt?: string;
  containedAt?: string;
  resolvedAt?: string;
  closedAt?: string;

  immediateActions?: string;
  rootCause?: string;
  correctiveActions?: string;
  preventiveActions?: string;
  resolutionNotes?: string;

  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export interface CreateIncidentInput {
  title: string;
  description?: string;
  type: IncidentType;
  source: IncidentSource;
  categoryId?: string;
  facilityId: string;
  assetId?: string;
  locationDetail?: string;
  reportedByUserId?: string;
  assignedToUserId?: string;
  assignedGroupId?: string;
  workOrderId?: string;
  workOrderIds?: string[];
  maintenanceIds?: string[];
  parentIncidentId?: string;
  operationalEventId?: string;
  reportedAt: string;
  discoveredAt?: string;
  reportedVia?: IncidentChannel;
  severity: IncidentSeverity;
  peopleAffected?: number;
  isEmergency?: boolean;
  status: IncidentStatus;
  holdReason?: string;
  requiresWorkOrder?: boolean;
  acknowledgedAt?: string;
  responseDueAt?: string;
  containedAt?: string;
  resolvedAt?: string;
  closedAt?: string;
  immediateActions?: string;
  rootCause?: string;
  correctiveActions?: string;
  preventiveActions?: string;
  resolutionNotes?: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateIncidentInput = Partial<CreateIncidentInput>;

/**
 * Client-facing intent for reporting an incident.
 * Quick report fields are required; Additional details are optional overrides.
 * Server applies defaults when optional fields are omitted.
 */
export type ReportIncidentInput = {
  title: string;
  facilityId: string;
  severity?: IncidentSeverity;
  description?: string;
  /** Optional master-data cascade ids (presentation); composed into locationDetail. */
  buildingId?: string;
  floorId?: string;
  roomId?: string;
  /** Free-text / composed location (building · floor · room · detail). */
  locationDetail?: string;

  /** Additional details — optional overrides of server defaults. */
  type?: IncidentType;
  source?: IncidentSource;
  status?: IncidentStatus;
  assignedToUserId?: string;
  reportedByUserId?: string;
  reportedAt?: string;
  reportedVia?: IncidentChannel;
  assetId?: string;
  requiresWorkOrder?: boolean;
  workOrderId?: string;
};

export interface IncidentListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  severity?: IncidentSeverity | "all";
  status?: IncidentStatus | "all";
  facilityId?: string | "all";
  assignedToUserId?: string | "all";
  requiresWorkOrder?: boolean | "all";
}

export type IncidentModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; incident: Incident }
  | { type: "view"; incident: Incident }
  | { type: "deactivate"; incident: Incident };
