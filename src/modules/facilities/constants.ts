import type { FacilityStatus, FacilityType } from "./types";

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

export const FACILITY_LOCATIONS = [
  "Lagos, Nigeria",
  "London, United Kingdom",
  "Accra, Ghana",
  "Nairobi, Kenya",
  "Abuja, Nigeria",
  "Johannesburg, South Africa",
] as const;

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
