import type { MaintenancePriority } from "@/modules/maintenance/types";
import type { IncidentSeverity } from "@/modules/incidents/types";

export type OccupantRequestKind = "maintenance" | "incident";

/** Occupant-facing lifecycle labels (mapped onto domain statuses). */
export type OccupantRequestStatus =
  | "submitted"
  | "assigned"
  | "in_progress"
  | "completed"
  | "closed";

export type OccupantActorKind = "anonymous" | "authenticated" | "external";

/**
 * Future-ready actor context.
 * Auth / external client identity can plug in here without redesigning forms.
 */
export interface OccupantActor {
  kind: OccupantActorKind;
  id?: string;
  displayName?: string;
  email?: string;
  facilityIds?: string[];
}

export interface OccupantAttachmentRef {
  fileName: string;
  mimeType?: string;
  sizeBytes?: number;
  /** Reserved for a future file-storage service. */
  storageKey?: string;
}

export interface MaintenanceRequestFormValues {
  title: string;
  description: string;
  facilityId: string;
  location: string;
  department: string;
  priority: MaintenancePriority;
  category: string;
  attachment?: File | null;
}

export interface IncidentRequestFormValues {
  title: string;
  description: string;
  facilityId: string;
  location: string;
  severity: IncidentSeverity;
  attachment?: File | null;
}

export interface OccupantRequestResult {
  kind: OccupantRequestKind;
  id: string;
  title: string;
  status: OccupantRequestStatus;
  facilityId: string;
  createdAt: string;
}
