import type { UserRole, UserStatus } from "./types";

export const USER_ROLES: UserRole[] = [
  "admin",
  "manager",
  "supervisor",
  "technician",
  "viewer",
];

export const USER_STATUSES: UserStatus[] = [
  "active",
  "pending",
  "inactive",
  "suspended",
];

export const USER_SPECIALIZATIONS = [
  "Electrical",
  "Mechanical",
  "HVAC",
  "Plumbing",
  "Fire & Safety",
  "Building Management",
  "General Operations",
  "Administration",
] as const;

export const USER_FACILITIES = [
  "Lagos HQ",
  "Docklands Campus",
  "Accra Hub",
  "Plant West",
  "Nairobi Centre",
  "All Facilities",
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
