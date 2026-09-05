import type { UserStatus } from "./types";
import type { UserSort } from "./types";
import { V1_OPERATING_ROLE_LABELS } from "@/lib/access";

/** V1 operating role labels stored on the People register. */
export const USER_ROLE_SUGGESTIONS = [
  V1_OPERATING_ROLE_LABELS.facility_manager,
  V1_OPERATING_ROLE_LABELS.fm_staff,
  V1_OPERATING_ROLE_LABELS.liaison_officer,
  V1_OPERATING_ROLE_LABELS.finance,
  V1_OPERATING_ROLE_LABELS.ncc_client,
  V1_OPERATING_ROLE_LABELS.executive,
] as const;

/** Create/edit status options for V1 (Active / Inactive). */
export const USER_MANAGE_STATUSES: UserStatus[] = ["active", "inactive"];

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

/** Default specialization when create form omits the field. */
export const DEFAULT_USER_SPECIALIZATION = "General Operations";
