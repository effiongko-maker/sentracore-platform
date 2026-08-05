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
    description:
      "Report a repair, service, or building issue for the facilities team.",
  },
  {
    id: "incident",
    title: "Incident Report",
    description:
      "Report a safety, security, or operational incident for immediate attention.",
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
  assigned: "Assigned",
  in_progress: "In Progress",
  completed: "Completed",
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
