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
 * Legacy / unassigned authenticated org members keep prior behaviour:
 * full FM + Finance module access (module gate only). Documented ambiguity.
 * Does NOT include platform.admin_override (that is Super Admin only).
 */
export const LEGACY_UNASSIGNED_CAPABILITIES: readonly AccessCapability[] = [
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
];

/**
 * Operational capabilities granted under Super Admin override.
 * Includes admin areas; never implies the Facility Manager role identity.
 */
export const SUPER_ADMIN_OVERRIDE_CAPABILITIES: readonly AccessCapability[] = [
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
  "platform.admin_override",
  // Explicitly omit fm.authorize_protected — override is not FM authorization.
];

export function capabilitiesForRole(
  role: V1OperatingRole | null,
  options?: { inactive?: boolean; unassigned?: boolean }
): AccessCapability[] {
  if (options?.inactive) return [];
  if (options?.unassigned || role == null) {
    return [...LEGACY_UNASSIGNED_CAPABILITIES];
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
 * True when the actor may satisfy a normal capability via platform override.
 * Does not rewrite role identity to Facility Manager.
 */
export function capabilitySatisfied(
  capabilities: readonly AccessCapability[],
  capability: AccessCapability
): boolean {
  if (hasCapability(capabilities, capability)) return true;
  if (capability === "platform.admin_override") return false;
  if (capability === "fm.authorize_protected") {
    // Platform override is not FM facility authorization.
    return false;
  }
  return hasCapability(capabilities, "platform.admin_override");
}
