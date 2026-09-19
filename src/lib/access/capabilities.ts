/**
 * Coarse V1 capabilities — not a full RBAC product UI.
 * Used to hide controls and reject permission-sensitive writes.
 *
 * Distinguishes:
 * - Facility Manager facility authority (`fm.authorize_protected`)
 * - Super Admin platform override (`platform.admin_override`)
 */

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
