import type { BoundModule } from "@/lib/access/moduleBoundary";
import { ECC_CAPABILITIES } from "@/modules/ecc-operations/types";
import { PRIVATE_OFFICE_CAPABILITIES } from "@/modules/private-office/types";
import { COMMAND_CENTRE_CAPABILITIES } from "@/modules/command-centre/types";
import type { ProfileStatus } from "@/lib/auth/types";

export const PLATFORM_IAM_AUDIT_ACTIONS = [
  "user.invited",
  "user.account_created",
  "user.temporary_password_issued",
  "user.password_changed",
  "profile.attached_to_organisation",
  "profile.activated",
  "profile.suspended",
  "profile.deactivated",
  "module.enabled",
  "module.disabled",
  "capability.granted",
  "capability.revoked",
  "user.offboarded",
  "access_scope.changed",
  "landing_workspace.changed",
  "facility_assignment.created",
  "facility_assignment.activated",
  "facility_assignment.deactivated",
  "facility_assignment.role_changed",
  "facility_assignment.facility_changed",
] as const;

export type PlatformIamAuditAction = (typeof PLATFORM_IAM_AUDIT_ACTIONS)[number];

/**
 * Platform-domain capabilities administrable through the control plane.
 * Includes FM AccessCapability strings. Platform-finance company grants stay separate.
 */
export const PLATFORM_ADMINISTRABLE_CAPABILITIES = [
  ECC_CAPABILITIES.view,
  ECC_CAPABILITIES.create,
  ECC_CAPABILITIES.edit,
  ECC_CAPABILITIES.managePeople,
  ECC_CAPABILITIES.manageFinance,
  ECC_CAPABILITIES.delete,
  COMMAND_CENTRE_CAPABILITIES.view,
  COMMAND_CENTRE_CAPABILITIES.decide,
  COMMAND_CENTRE_CAPABILITIES.commitmentsView,
  COMMAND_CENTRE_CAPABILITIES.commitmentsManage,
  PRIVATE_OFFICE_CAPABILITIES.access,
  "ops.view",
  "ops.create",
  "ops.edit",
  "ops.submit",
  "users.view",
  "users.manage",
  "requests.view",
  "finance.view",
  "finance.create",
  "finance.submit",
  "finance.authorize",
  "finance.pay",
  "approvals.manage",
  "fm.authorize_protected",
] as const;

export type PlatformAdministrableCapability =
  (typeof PLATFORM_ADMINISTRABLE_CAPABILITIES)[number];

export function isPlatformAdministrableCapability(
  value: unknown
): value is PlatformAdministrableCapability {
  return (
    typeof value === "string" &&
    (PLATFORM_ADMINISTRABLE_CAPABILITIES as readonly string[]).includes(value)
  );
}

export const PLATFORM_ADMIN_FOLLOW_UPS = [
  "auth_sign_in_disable",
  "fm_people_deactivate",
  "profile_organisation_attachment",
] as const;

export type PlatformAdminFollowUp = (typeof PLATFORM_ADMIN_FOLLOW_UPS)[number];

export type OrganisationModuleAdminStatus = "enabled" | "disabled" | "preparing";

export type OrganisationAdminRecord = {
  id: string;
  name: string;
  slug: string;
  status: string;
  modules: Array<{
    slug: string;
    name: string;
    status: OrganisationModuleAdminStatus;
  }>;
};

export type PlatformIdentityAdminRecord = {
  profileId: string;
  email: string | null;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  organisationId: string | null;
  organisationSlug: string | null;
  organisationName: string | null;
  status: ProfileStatus;
  platformCapabilities: string[];
  operationalIdentity: {
    domain: string;
    externalIdentityId: string;
    status: string;
  } | null;
  financeWorkspaceGrantPresent: boolean;
};

/** Result of attaching an EXISTING sign-in identity to an organisation (no email is sent by this action). */
export type AttachProfileResult = {
  email: string;
  profileId: string | null;
  organisationId: string;
  attached: boolean;
  alreadyExisted: boolean;
  followUpRequired: PlatformAdminFollowUp[];
};

/** Result of creating an account. `temporaryPassword` exists ONLY in this response — it is never stored or audited. */
export type CreateAccountResult = {
  profileId: string;
  email: string;
  organisationId: string;
  /** Shown to the creating administrator exactly once. Never persisted, logged or audited. */
  temporaryPassword: string;
  mustChangePassword: true;
  accessScope: "platform" | "module";
  homeModule: string | null;
  landingWorkspace: string | null;
  assignment: { facilityId: string; operationalRole: string } | null;
  capabilityPackage: "facility_manager" | null;
  grantedCapabilities: string[];
  /** Always false: account creation sends no Auth email of any kind. */
  authEmailSent: false;
};

/** Result of issuing a new temporary password to an existing account. Same one-time contract. */
export type IssueTemporaryPasswordResult = {
  profileId: string;
  email: string;
  temporaryPassword: string;
  mustChangePassword: true;
};

export type ProfileStatusResult = {
  profileId: string;
  organisationId: string | null;
  status: ProfileStatus;
  previousStatus: ProfileStatus;
  changed: boolean;
  authSignInDisabled: boolean | null;
};

export type OrganisationModuleResult = {
  organisationId: string;
  moduleSlug: string;
  status: "enabled" | "disabled";
  changed: boolean;
};

export type PlatformCapabilityGrantResult = {
  organisationId: string;
  profileId: string;
  capability: PlatformAdministrableCapability;
  changed: boolean;
};

/**
 * Result of a batch capability edit (Admin Console Access → Edit access). Best-effort, per-item: each grant/
 * revoke is applied through the same audited platform_iam_grant_platform_capability /
 * platform_iam_revoke_platform_capability RPCs used for a single change, one at a time, in one server-side
 * call. A failure on one item does not abort the rest — granted/revoked list what actually succeeded; failed
 * lists exactly what did not, with the reason, so the client can reconcile the UI with reality rather than
 * assume success.
 */
export type PlatformCapabilityBatchResult = {
  granted: PlatformAdministrableCapability[];
  revoked: PlatformAdministrableCapability[];
  failed: Array<{
    capability: PlatformAdministrableCapability;
    action: "grant" | "revoke";
    message: string;
  }>;
};

export type FmOperationalDeactivation =
  | { state: "deactivated" }
  | { state: "not_applicable" }
  | { state: "failed"; message: string };

export type OffboardResult = {
  profileId: string;
  organisationId: string | null;
  previousStatus: ProfileStatus;
  status: "inactive";
  platformAccessRevoked: boolean;
  authSignInDisabled: boolean;
  fmOperationalIdentityDeactivated: FmOperationalDeactivation["state"];
  followUpRequired: PlatformAdminFollowUp[];
  fullyOffboarded: boolean;
  revoked: {
    financeCapabilityGrants: number;
    platformCapabilityGrants: number;
    financeCompanyAccess: number;
    financeFinancialAccountAccess: number;
    operationalIdentityLinksInactivated: number;
    fmFacilityAssignmentsInactivated: number;
  };
};

/**
 * Reversible Auth sign-in disable. GoTrue has no permanent "disable" flag
 * without deletion; a long ban_duration is the supported mechanism.
 * Lift with ban_duration: "none".
 */
export const PLATFORM_AUTH_SIGN_IN_DISABLE_BAN_DURATION = "876000h";

// ---------------------------------------------------------------------------
// Admin Console read models (Super-Admin-gated; authoritative data only)
// ---------------------------------------------------------------------------

export type AdminFacilityAssignment = {
  assignmentId: string;
  facilityId: string;
  facilityName: string;
  operationalRole: string;
  status: "active" | "inactive";
};

export type AdminFinanceAccess = {
  /** platform_finance.* capability keys held (read-only in the Admin Console). */
  capabilities: string[];
  companies: string[];
  financialAccountAccessCount: number;
};

export type AdminPersonSummary = {
  profileId: string;
  fullName: string | null;
  email: string | null;
  jobTitle: string | null;
  status: ProfileStatus;
  organisationId: string | null;
  organisationName: string | null;
  isPlatformSuperAdmin: boolean;
  /** Explicit platform capability grants (keys). */
  capabilities: string[];
  financeAccessPresent: boolean;
  facilityAssignments: AdminFacilityAssignment[];
};

export type AdminPersonDetail = AdminPersonSummary & {
  /** Descriptive organisation roles from the role catalog — NOT permissions. */
  organisationRoles: string[];
  financeAccess: AdminFinanceAccess;
  operationalIdentity: { domain: string; externalIdentityId: string; status: string } | null;
  /** Access scope: platform (default) or bound to one operational module (upper boundary). */
  accessScope: "platform" | "module";
  homeModule: BoundModule | null;
  /** UX routing preference (platform scope only); never authority. */
  landingWorkspace: string | null;
};

export type LandingWorkspaceResult = {
  profileId: string;
  organisationId: string | null;
  landingWorkspace: string | null;
  changed: boolean;
};

export type AccessScopeResult = {
  profileId: string;
  organisationId: string | null;
  accessScope: "platform" | "module";
  homeModule: BoundModule | null;
  changed: boolean;
};

export type AdminAuditEntry = {
  id: string;
  at: string;
  action: string;
  category: string | null;
  actor: { profileId: string; name: string };
  person: { profileId: string; name: string } | null;
  headline: string;
  detail: string[];
};

export type AdminOverview = {
  organisation: { id: string; name: string; slug: string; status: string };
  modules: Array<{ slug: string; name: string; description: string | null; status: OrganisationModuleAdminStatus }>;
  peopleByStatus: Record<ProfileStatus, number>;
  peopleTotal: number;
  /** Active people who hold no explicit platform capability grant and are not Super Admin. */
  activeWithoutGrants: number;
  recentAudit: AdminAuditEntry[];
};

export type AdminAuditPage = {
  events: AdminAuditEntry[];
  /** Pass back as `before` to load older events; null when there are none. */
  nextBefore: string | null;
};

export type AdminModuleRecord = {
  slug: string;
  name: string;
  description: string | null;
  status: OrganisationModuleAdminStatus;
  /** People holding at least one explicit grant in this module's capability domains. */
  peopleWithGrants: number | null;
};

export type FacilityAssignmentResult = {
  assignmentId: string;
  profileId: string;
  facilityId: string;
  operationalRole: string;
  status: "active" | "inactive";
};
