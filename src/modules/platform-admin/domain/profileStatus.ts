import type { ProfileStatus } from "@/lib/auth/types";

/**
 * Canonical platform profile status transitions.
 * `invited → active` is organisation attachment, not this matrix.
 */
const ALLOWED: Record<ProfileStatus, readonly ProfileStatus[]> = {
  invited: ["invited", "inactive", "suspended"],
  active: ["active", "inactive", "suspended"],
  suspended: ["suspended", "active", "inactive"],
  inactive: ["inactive", "active", "suspended"],
};

export function isProfileStatus(value: unknown): value is ProfileStatus {
  return (
    value === "invited" ||
    value === "active" ||
    value === "suspended" ||
    value === "inactive"
  );
}

export function isAllowedProfileStatusTransition(
  from: ProfileStatus,
  to: ProfileStatus
): boolean {
  return ALLOWED[from].includes(to);
}

export function profileStatusRequiresAuthDisable(
  status: ProfileStatus
): boolean {
  return status === "inactive" || status === "suspended";
}
