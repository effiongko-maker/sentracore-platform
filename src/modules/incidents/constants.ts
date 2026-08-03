import type {
  IncidentChannel,
  IncidentSeverity,
  IncidentSource,
  IncidentStatus,
  IncidentType,
} from "./types";

export const INCIDENT_TYPES: IncidentType[] = [
  "equipment_failure",
  "safety",
  "security",
  "utility_failure",
  "environmental",
  "observation",
  "service_request",
  "complaint",
  "other",
];

export const INCIDENT_SEVERITIES: IncidentSeverity[] = [
  "low",
  "medium",
  "high",
  "critical",
];

export const INCIDENT_STATUSES: IncidentStatus[] = [
  "reported",
  "triaged",
  "investigating",
  "contained",
  "resolved",
  "closed",
  "cancelled",
];

export const INCIDENT_SOURCES: IncidentSource[] = [
  "manual",
  "technician",
  "sensor",
  "tenant",
  "security",
  "system",
  "external",
];

export const INCIDENT_CHANNELS: IncidentChannel[] = [
  "portal",
  "mobile",
  "phone",
  "email",
  "radio",
  "walk_in",
  "system",
  "other",
];

export const INCIDENT_SEVERITY_VARIANT: Record<
  IncidentSeverity,
  "neutral" | "info" | "warning" | "danger"
> = {
  low: "neutral",
  medium: "info",
  high: "warning",
  critical: "danger",
};

export const INCIDENT_STATUS_VARIANT: Record<
  IncidentStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  reported: "info",
  triaged: "info",
  investigating: "warning",
  contained: "warning",
  resolved: "success",
  closed: "success",
  cancelled: "neutral",
};

export const INCIDENTS_PAGE_SIZE = 8;
