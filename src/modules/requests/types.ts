export type RequestStatus =
  | "submitted"
  | "under_review"
  | "being_treated"
  | "resolved"
  | "closed"
  | "cancelled";

/** Intake classification only — does not create Maintenance/Incident records. */
export type RequestType = "maintenance" | "incident";

/** Canonical Request domain model — intake layer before operational treatment. */
export interface RequestRecord {
  id: string;
  title: string;
  description?: string;
  facilityId: string;
  occurredAt: string;
  locationDetail?: string;
  reporterName?: string;
  reporterContact?: string;
  reportedByUserId?: string;
  /** Optional for records created before requestType existed. */
  requestType?: RequestType;
  status: RequestStatus;
  incidentIds: string[];
  maintenanceIds: string[];
  workOrderIds: string[];
  createdAt: string;
  updatedAt: string;
  createdByUserId?: string;
  updatedByUserId?: string;
}

export interface CreateRequestInput {
  title: string;
  description?: string;
  facilityId: string;
  occurredAt?: string;
  locationDetail?: string;
  reporterName?: string;
  reporterContact?: string;
  reportedByUserId?: string;
  requestType?: RequestType;
  status?: RequestStatus;
  incidentIds?: string[];
  maintenanceIds?: string[];
  workOrderIds?: string[];
  createdByUserId?: string;
  updatedByUserId?: string;
}

export type UpdateRequestInput = Partial<CreateRequestInput> & {
  id: string;
};

export interface RequestListParams {
  page?: number;
  pageSize?: number;
  search?: string;
  status?: RequestStatus | "all";
  facilityId?: string | "all";
}

export type RequestModalState =
  | { type: "closed" }
  | { type: "create" }
  | { type: "edit"; request: RequestRecord }
  | { type: "view"; request: RequestRecord }
  | { type: "deactivate"; request: RequestRecord };
