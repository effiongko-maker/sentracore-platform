/**
 * Coarse V1 capabilities — not a full RBAC product UI.
 * Used to hide controls and reject permission-sensitive writes.
 *
 * Distinguishes:
 * - Facility Manager facility authority (`fm.authorize_protected`)
 * - Super Admin platform override (`platform.admin_override`)
 */

import type { V1OperatingRole } from "./roles";

export const ACCESS_CAPABILITIES = [
  "users.view",
  "users.manage",
  "ops.view",
  "ops.create",
  "ops.edit",
  "ops.submit",
  "finance.view",
  "finance.create",
  "finance.submit",
  "finance.authorize",
  "finance.pay",
  "approvals.manage",
  "requests.view",
  /**
   * Facility Manager facility-level authority for protected actions
   * (password / FM auth — next security slice). Not platform override.
   */
  "fm.authorize_protected",
  /**
   * System Administrator platform-wide administrative override.
   * Distinct from FM; does not require FM authorization.
   */
  "platform.admin_override",
] as const;

export type AccessCapability = (typeof ACCESS_CAPABILITIES)[number];

const ROLE_CAPABILITIES: Record<V1OperatingRole, readonly AccessCapability[]> = {
  facility_manager: [
    "users.view",
    "users.manage",
    "ops.view",
    "ops.create",
    "ops.edit",
    "ops.submit",
    "finance.view",
    "finance.create",
    "finance.submit",
    "finance.authorize",
    "finance.pay",
    "approvals.manage",
    "requests.view",
    "fm.authorize_protected",
  ],
  fm_staff: [
    "users.view",
    "ops.view",
    "ops.create",
    "ops.edit",
    "ops.submit",
    "finance.view",
    "finance.create",
    "finance.submit",
    "approvals.manage",
    "requests.view",
  ],
  liaison_officer: [
    "users.view",
    "ops.view",
    "finance.view",
    "requests.view",
  ],
  finance: [
    "users.view",
    "ops.view",
    "finance.view",
    "finance.create",
    "finance.submit",
    "finance.authorize",
    "finance.pay",
    "requests.view",
  ],
  ncc_client: [
    // Requests portal only — no ops.view so WO/MNT/INC/approvals APIs stay closed
    "requests.view",
  ],
  /**
   * Boss / executive — VIEW and DRILL-DOWN only.
   * No create/edit/submit/authorize/pay/manage-users/protected FM auth.
   */
  executive: [
    "ops.view",
    "finance.view",
    "requests.view",
  ],
};

/**
 * Platform Super Admin override is limited to platform administration of people.
 * It does NOT grant FM business-data capabilities (ops.*, finance.*,
 * approvals.manage, requests.view, fm.authorize_protected).
 */
export const SUPER_ADMIN_OVERRIDE_CAPABILITIES: readonly AccessCapability[] = [
  "users.view",
  "users.manage",
  "platform.admin_override",
];

/**
 * FM AccessCapability strings that may be stored on platform_capability_grants.
 * platform.admin_override is derived from Super Admin, not granted here.
 */
export const FM_EXPLICIT_GRANT_CAPABILITIES = ACCESS_CAPABILITIES.filter(
  (capability) => capability !== "platform.admin_override"
);

/**
 * Historical role → capability catalog. NOT runtime authorization.
 * Runtime authority is explicit platform_capability_grants only.
 */
export function capabilitiesForRole(
  role: V1OperatingRole | null,
  options?: { inactive?: boolean; unassigned?: boolean }
): AccessCapability[] {
  if (options?.inactive) return [];
  if (options?.unassigned || role == null) {
    return [];
  }
  return [...ROLE_CAPABILITIES[role]];
}

export function hasCapability(
  capabilities: readonly AccessCapability[],
  capability: AccessCapability
): boolean {
  return capabilities.includes(capability);
}

/**
 * Exact capability match only. platform.admin_override does not satisfy ops.*.
 */
export function capabilitySatisfied(
  capabilities: readonly AccessCapability[],
  capability: AccessCapability
): boolean {
  return hasCapability(capabilities, capability);
}
