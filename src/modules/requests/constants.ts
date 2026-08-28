import type { RequestStatus, RequestType } from "./types";

export const REQUEST_STATUSES: RequestStatus[] = [
  "submitted",
  "under_review",
  "being_treated",
  "resolved",
  "closed",
  "cancelled",
];

export const REQUEST_TYPES: RequestType[] = ["maintenance", "incident"];

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  maintenance: "Maintenance",
  incident: "Incident",
};

export const REQUEST_STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Submitted",
  under_review: "Under Review",
  being_treated: "Being Treated",
  resolved: "Resolved",
  closed: "Closed",
  cancelled: "Cancelled",
};

export const REQUEST_STATUS_VARIANT: Record<
  RequestStatus,
  "neutral" | "info" | "warning" | "success" | "danger"
> = {
  submitted: "info",
  under_review: "info",
  being_treated: "warning",
  resolved: "success",
  closed: "neutral",
  cancelled: "danger",
};

export const REQUESTS_PAGE_SIZE = 8;
