import type { UserStatus } from "./types";
import type { UserSort } from "./types";

/** Default suggestions for new users — sheet roles are free-form. */
export const USER_ROLE_SUGGESTIONS = [
  "CEO",
  "Facility Manager",
  "Liaison Officer",
  "Technical",
  "Cleaning Supervisor",
  "Admin",
  "Manager",
  "Supervisor",
  "Technician",
] as const;

export const USER_STATUSES: UserStatus[] = [
  "active",
  "pending",
  "inactive",
  "suspended",
];

export const USER_SPECIALIZATIONS = [
  "Executive",
  "Admin",
  "Electrical",
  "Mechanical",
  "HVAC",
  "Plumbing",
  "Fire & Safety",
  "Cleaning",
  "Building Management",
  "General Operations",
  "Administration",
] as const;

export const USER_STATUS_VARIANT: Record<
  UserStatus,
  "success" | "warning" | "danger" | "neutral"
> = {
  active: "success",
  pending: "warning",
  suspended: "danger",
  inactive: "neutral",
};

export const USERS_PAGE_SIZE = 8;

export const USER_SORT_OPTIONS: Array<{ value: UserSort; label: string }> = [
  { value: "newest", label: "Newest" },
];

export const DEFAULT_USER_SORT: UserSort = "newest";
