import type { FacilityStatus, FacilityType } from "./types";

/** The facility-type vocabulary the database enforces (fm_facilities_type_check). Filters show only types in use. */
export const FACILITY_TYPES: FacilityType[] = [
  "headquarters",
  "campus",
  "plant",
  "warehouse",
  "hub",
  "office",
];

export const FACILITY_STATUSES: FacilityStatus[] = [
  "active",
  "pending",
  "inactive",
  "suspended",
];

export const FACILITY_STATUS_VARIANT: Record<
  FacilityStatus,
  "success" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  inactive: "neutral",
};

export const FACILITIES_PAGE_SIZE = 8;
