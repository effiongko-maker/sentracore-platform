import type { User, UserStatus } from "@/modules/users/types";
import {
  SUPER_ADMIN_OVERRIDE_CAPABILITIES,
  capabilitySatisfied,
  hasCapability,
  type AccessCapability,
} from "./capabilities";
import {
  PLATFORM_ROLE_LABELS,
  type PlatformRole,
} from "./platformRoles";
import {
  parseV1OperatingRole,
  v1OperatingRoleLabel,
  type V1OperatingRole,
} from "./roles";

export type OperatingAccessSource = "platform" | "assignment" | "unassigned";

/**
 * How administrative / protected authority is exercised.
 * platform_override ≠ facility_manager (never conflate).
 */
export type AuthorityKind =
  | "platform_override"
  | "facility_manager"
  | "operating";

/**
 * How a protected action may be authorized in the next security slice.
 * Modes are mutually exclusive in preference: override wins when present,
 * but remains distinguishable from FM facility authorization.
 */
export type ProtectedActionAuthority =
  | { mode: "platform_override"; label: "System Administrator override" }
  | { mode: "facility_manager"; label: "Facility Manager authorization" };

export type OperatingAccess = {
  email: string;
  name: string;
  /**
   * V1 facility operating role from assignment context (or null).
   * Descriptive only — never a capability grant.
   */
  role: V1OperatingRole | null;
  roleLabel: string;
  /**
   * Platform role when Super Admin — independent of operating role.
   */
  platformRole: PlatformRole | null;
  platformRoleLabel: string | null;
  /** True when session has System Administrator / Super Admin. */
  isSuperAdmin: boolean;
  /** True when platform.admin_override is in force. */
  hasAdminOverride: boolean;
  authorityKind: AuthorityKind;
  status: UserStatus | "" | "unknown";
  facility: string;
  /**
   * Canonical UUID of the user's active facility assignment (empty when none).
   * The only source for the scoped facility — never a display name or code.
   */
  facilityId: string;
  source: OperatingAccessSource;
  /**
   * True when no valid V1 operating assignment resolved.
   * Unassigned is diagnostic only — it grants zero FM operating capabilities.
   */
  unassigned: boolean;
  inactive: boolean;
  capabilities: AccessCapability[];
  /** Canonical actor identity: platform profile UUID when known. */
  sheetUserId?: string;
  /** Transitional Sheet WO mapping is never an authorization grant. */
  operationalIdentitySource?: "explicit_link" | "email_fallback";
};

export function isInactiveUserStatus(status: string | null | undefined): boolean {
  const token = String(status ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");
  return token === "inactive" || token === "suspended" || token === "deactivated";
}

function baseAuthorityKind(role: V1OperatingRole | null): AuthorityKind {
  return role === "facility_manager" ? "facility_manager" : "operating";
}

export function resolveOperatingAccessFromGrants(input: {
  email: string;
  name: string;
  role?: V1OperatingRole | null;
  roleLabel?: string;
  status?: UserStatus | "" | "unknown";
  facility?: string;
  facilityId?: string;
  inactive?: boolean;
  unassigned?: boolean;
  capabilities: readonly AccessCapability[];
  profileId?: string;
}): OperatingAccess {
  const role = input.role ?? null;
  const unassigned = input.unassigned ?? role == null;
  return {
    email: input.email,
    name: input.name,
    role,
    roleLabel:
      input.roleLabel ??
      (role ? v1OperatingRoleLabel(role) : "Unassigned"),
    platformRole: null,
    platformRoleLabel: null,
    isSuperAdmin: false,
    hasAdminOverride: false,
    authorityKind: baseAuthorityKind(role),
    status: input.status ?? "unknown",
    facility: input.facility ?? "",
    facilityId: input.facilityId ?? "",
    source: "platform",
    unassigned,
    inactive: Boolean(input.inactive),
    capabilities: [...input.capabilities],
    ...(input.profileId ? { sheetUserId: input.profileId } : {}),
  };
}

/**
 * @deprecated Sheet USERS is not FM runtime authority. Kept for static tests
 * of descriptive role parsing. Does NOT map job title to capabilities.
 */
export function resolveOperatingAccessFromSheetUser(
  email: string,
  name: string,
  sheetUser: Pick<User, "id" | "role" | "status" | "facility" | "name" | "email"> | null
): OperatingAccess {
  if (!sheetUser) {
    return resolveOperatingAccessFromGrants({
      email,
      name,
      role: null,
      unassigned: true,
      inactive: false,
      capabilities: [],
    });
  }

  const role = parseV1OperatingRole(sheetUser.role);
  const inactive = isInactiveUserStatus(sheetUser.status);
  const unassigned = role == null;
  return resolveOperatingAccessFromGrants({
    email: sheetUser.email || email,
    name: sheetUser.name || name,
    role,
    roleLabel: role ? v1OperatingRoleLabel(role) : sheetUser.role || "Unassigned",
    status: sheetUser.status || "",
    facility: sheetUser.facility || "",
    inactive,
    unassigned,
    capabilities: [],
    profileId: sheetUser.id,
  });
}

/**
 * Apply System Administrator / Super Admin platform override.
 * Preserves any facility operating role identity — never rewrites it to FM.
 * Does not grant FM business-data capabilities.
 */
export function applyPlatformSuperAdmin(
  access: OperatingAccess,
  isSuperAdmin: boolean
): OperatingAccess {
  if (!isSuperAdmin) return access;

  const merged = new Set<AccessCapability>([
    ...access.capabilities.filter((c) => c !== "fm.authorize_protected"),
    ...SUPER_ADMIN_OVERRIDE_CAPABILITIES,
  ]);

  return {
    ...access,
    platformRole: "system_administrator",
    platformRoleLabel: PLATFORM_ROLE_LABELS.system_administrator,
    isSuperAdmin: true,
    hasAdminOverride: true,
    authorityKind: "platform_override",
    capabilities: [...merged],
  };
}

export function accessCan(
  access: Pick<OperatingAccess, "capabilities">,
  capability: AccessCapability
): boolean {
  return capabilitySatisfied(access.capabilities, capability);
}

/**
 * Foundation for the protected-action security slice.
 * Prefer platform override when present; otherwise FM facility authorization.
 * Modes remain distinguishable for audit / UX.
 */
export function resolveProtectedActionAuthority(
  access: Pick<
    OperatingAccess,
    "capabilities" | "hasAdminOverride" | "isSuperAdmin" | "role"
  >
): ProtectedActionAuthority | null {
  if (
    access.hasAdminOverride ||
    hasCapability(access.capabilities, "platform.admin_override")
  ) {
    return {
      mode: "platform_override",
      label: "System Administrator override",
    };
  }
  if (hasCapability(access.capabilities, "fm.authorize_protected")) {
    return {
      mode: "facility_manager",
      label: "Facility Manager authorization",
    };
  }
  return null;
}

export function findSheetUserByEmail(
  users: Array<Pick<User, "id" | "role" | "status" | "facility" | "name" | "email">>,
  email: string
): (typeof users)[number] | null {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  return (
    users.find((row) => row.email.trim().toLowerCase() === target) ?? null
  );
}
