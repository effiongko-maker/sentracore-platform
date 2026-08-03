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
  workOrderId?: string;
  parentIncidentId?: string;

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
  parentIncidentId?: string;
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
