import type { User, UserStatus } from "@/modules/users/types";
import {
  SUPER_ADMIN_OVERRIDE_CAPABILITIES,
  capabilitySatisfied,
  capabilitiesForRole,
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

export type OperatingAccessSource = "sheet" | "unassigned";

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
   * V1 facility operating role from People register (or null).
   * Never set to facility_manager solely because the user is Super Admin.
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
  source: OperatingAccessSource;
  /**
   * True when no People-register match — capabilities fall back to legacy
   * full module access so existing logins are not locked out.
   */
  unassigned: boolean;
  inactive: boolean;
  capabilities: AccessCapability[];
  sheetUserId?: string;
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

/**
 * Resolve operating access from a People-register row (sheet User).
 * Does not apply Super Admin — call applyPlatformSuperAdmin after.
 */
export function resolveOperatingAccessFromSheetUser(
  email: string,
  name: string,
  sheetUser: Pick<User, "id" | "role" | "status" | "facility" | "name" | "email"> | null
): OperatingAccess {
  if (!sheetUser) {
    const capabilities = capabilitiesForRole(null, { unassigned: true });
    return {
      email,
      name,
      role: null,
      roleLabel: "Unassigned",
      platformRole: null,
      platformRoleLabel: null,
      isSuperAdmin: false,
      hasAdminOverride: false,
      authorityKind: "operating",
      status: "unknown",
      facility: "",
      source: "unassigned",
      unassigned: true,
      inactive: false,
      capabilities,
    };
  }

  const role = parseV1OperatingRole(sheetUser.role);
  const inactive = isInactiveUserStatus(sheetUser.status);
  const unassigned = role == null;
  const capabilities = capabilitiesForRole(role, { inactive, unassigned });

  return {
    email: sheetUser.email || email,
    name: sheetUser.name || name,
    role,
    roleLabel: role ? v1OperatingRoleLabel(role) : sheetUser.role || "Unassigned",
    platformRole: null,
    platformRoleLabel: null,
    isSuperAdmin: false,
    hasAdminOverride: false,
    authorityKind: baseAuthorityKind(role),
    status: sheetUser.status || "",
    facility: sheetUser.facility || "",
    source: "sheet",
    unassigned,
    inactive,
    capabilities,
    sheetUserId: sheetUser.id,
  };
}

/**
 * Apply System Administrator / Super Admin platform override.
 * Preserves any facility operating role identity — never rewrites it to FM.
 * Sheet inactive does not block platform override (production administration).
 */
export function applyPlatformSuperAdmin(
  access: OperatingAccess,
  isSuperAdmin: boolean
): OperatingAccess {
  if (!isSuperAdmin) return access;

  const merged = new Set<AccessCapability>([
    ...access.capabilities.filter(
      (c) => c !== "fm.authorize_protected"
    ),
    ...SUPER_ADMIN_OVERRIDE_CAPABILITIES,
  ]);

  return {
    ...access,
    // Keep access.role / roleLabel unchanged — Super Admin ≠ Facility Manager.
    platformRole: "system_administrator",
    platformRoleLabel: PLATFORM_ROLE_LABELS.system_administrator,
    isSuperAdmin: true,
    hasAdminOverride: true,
    authorityKind: "platform_override",
    inactive: false,
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
