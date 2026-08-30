import type { MaintenancePriority } from "@/modules/maintenance/types";
import type { IncidentSeverity } from "@/modules/incidents/types";
import type { OccupantRequestKind, OccupantRequestStatus } from "./types";

export const OCCUPANT_REQUEST_KINDS: Array<{
  id: OccupantRequestKind;
  title: string;
  description: string;
}> = [
  {
    id: "maintenance",
    title: "Maintenance Request",
    description: "Something needs repair or attention",
  },
  {
    id: "incident",
    title: "Incident Report",
    description: "An unexpected event or safety concern",
  },
];

export const MAINTENANCE_REQUEST_CATEGORIES = [
  "HVAC",
  "Electrical",
  "Plumbing",
  "Cleaning",
  "Access & Security",
  "Lighting",
  "General",
  "Other",
] as const;

export const OCCUPANT_PRIORITIES: MaintenancePriority[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const OCCUPANT_SEVERITIES: IncidentSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const OCCUPANT_STATUS_LABELS: Record<OccupantRequestStatus, string> = {
  submitted: "Submitted",
  assigned: "Being reviewed",
  in_progress: "Being treated",
  completed: "Resolved",
  closed: "Closed",
};

export const OCCUPANT_STATUS_VARIANT: Record<
  OccupantRequestStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  submitted: "info",
  assigned: "info",
  in_progress: "warning",
  completed: "success",
  closed: "neutral",
};
