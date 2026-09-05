export {
  V1_OPERATING_ROLES,
  V1_OPERATING_ROLE_LABELS,
  V1_OPERATING_ROLE_OPTIONS,
  parseV1OperatingRole,
  v1OperatingRoleLabel,
  isV1OperatingRole,
  type V1OperatingRole,
} from "./roles";

export {
  PLATFORM_SUPER_ADMIN_SLUG,
  PLATFORM_ROLES,
  PLATFORM_ROLE_LABELS,
  PLATFORM_SUPER_ADMIN_DISPLAY_ALIASES,
  isPlatformSuperAdminFromSlugs,
  platformRoleLabel,
  type PlatformRole,
} from "./platformRoles";

export {
  ACCESS_CAPABILITIES,
  LEGACY_UNASSIGNED_CAPABILITIES,
  SUPER_ADMIN_OVERRIDE_CAPABILITIES,
  capabilitiesForRole,
  hasCapability,
  capabilitySatisfied,
  type AccessCapability,
} from "./capabilities";

export {
  resolveOperatingAccessFromSheetUser,
  applyPlatformSuperAdmin,
  accessCan,
  resolveProtectedActionAuthority,
  findSheetUserByEmail,
  isInactiveUserStatus,
  type OperatingAccess,
  type OperatingAccessSource,
  type AuthorityKind,
  type ProtectedActionAuthority,
} from "./resolveAccess";

export {
  VISIBILITY_SURFACES,
  resolveAccessVisibility,
  canSeeSurface,
  canSeeHref,
  surfaceForHref,
  mutationCapabilityForQuickAction,
  type VisibilitySurface,
  type AccessVisibility,
} from "./visibility";

export {
  OPERATIONAL_PROXY_RESOURCES,
  capabilityForOperationalProxyAction,
  capabilityForRequestsProxyAction,
  isOperationalWriteAction,
  type OperationalProxyResource,
} from "./operationalApiGate";

export {
  PROTECTED_ACTION_IDS,
  PROTECTED_ACTIONS,
  PROTECTED_PROOF_KEYS,
  getProtectedActionDefinition,
  isProtectedActionId,
  type ProtectedActionId,
  type ProtectedActionDefinition,
} from "./protectedActions";

/** Preferred facility display name for V1 single-facility deployment. */
export const V1_DEPLOYED_FACILITY_NAME = "NCC Annex";
