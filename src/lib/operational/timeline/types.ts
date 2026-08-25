export type OperationalTimelineEntityType =
  | "incident"
  | "maintenance"
  | "work_order";

export type OperationalTimelineEvent = {
  id: string;
  occurredAt: string;
  entityType: OperationalTimelineEntityType | string;
  entityId: string;
  eventType: string;
  facilityId: string | null;
  assetId: string | null;
  incidentId?: string | null;
  maintenanceId?: string | null;
  workOrderIds?: string[];
  previousStatus?: string | null;
  nextStatus?: string | null;
  actor?: string | null;
  intakeSource?: string | null;
  transitionSource?: string | null;
  issueType?: string | null;
  categoryId?: string | null;
};

export type OperationalTimelineQuery = {
  organisationId: string;
  fromIso?: string;
  toIso?: string;
  facilityId?: string;
  assetId?: string;
  incidentId?: string;
  maintenanceId?: string;
  workOrderId?: string;
  limit?: number;
};

export type LifecycleEventRow = {
  id: string;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  occurred_at: string;
  data: Record<string, unknown> | null;
};
