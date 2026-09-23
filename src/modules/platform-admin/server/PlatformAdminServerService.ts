import { ActionError } from "@/lib/actions/errors";
import { createAdminClient } from "@/utils/supabase/admin";
import type { ProfileStatus } from "@/lib/auth/types";
import {
  isAllowedProfileStatusTransition,
  isProfileStatus,
  profileStatusRequiresAuthDisable,
} from "../domain/profileStatus";
import {
  isPlatformAdministrableCapability,
  PLATFORM_AUTH_SIGN_IN_DISABLE_BAN_DURATION,
  type FacilityAssignmentResult,
  type AttachProfileResult,
  type CreateAccountResult,
  type IssueTemporaryPasswordResult,
  type PlatformAdministrableCapability,
  type OffboardResult,
  type OrganisationAdminRecord,
  type OrganisationModuleResult,
  type PlatformAdminFollowUp,
  type PlatformCapabilityGrantResult,
  type PlatformCapabilityBatchResult,
  type PlatformIdentityAdminRecord,
  type AccessScopeResult,
  type FmFacilityScopeResult,
  type LandingWorkspaceResult,
  type ProfileStatusResult,
} from "../types";
import { FmPeopleRepository } from "@/modules/users/server/FmPeopleRepository";
import {
  FmPeopleNotFoundError,
  FmPeopleUnavailableError,
  FmPeopleValidationError,
  parseAssignmentStatus,
  parseOperationalRole,
} from "@/modules/users/server/fmPeopleDomain";
import { isBoundModule } from "@/lib/access/moduleBoundary";
import { workspaceEntry, workspaceLabel } from "@/lib/access/workspaceRegistry";
import { facilityManagerPackageGaps } from "@/lib/access/facilityManagerPackage";
import { MUST_CHANGE_PASSWORD_KEY } from "@/lib/auth/passwordLifecycle";
import { generateTemporaryPassword } from "./temporaryPassword";
import { isLandingWorkspace } from "@/lib/access/landingWorkspace";
import { AdminConsoleReader } from "./AdminConsoleReader";
import { PlatformAdminRepository } from "./PlatformAdminRepository";
import type { PlatformAdminContext } from "./requirePlatformAdmin";

type AdminClient = ReturnType<typeof createAdminClient>;

async function findAuthUserIdByEmail(
  admin: AdminClient,
  email: string
): Promise<string | null> {
  for (let page = 1; page <= 10; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) throw error;
    const match = data.users.find(
      (user) => user.email?.toLowerCase() === email
    );
    if (match) return match.id;
    if (data.users.length < 200) break;
  }
  return null;
}

async function loadAuthEmailMap(
  admin: AdminClient,
  profileIds: string[]
): Promise<Map<string, string | null>> {
  const emails = new Map<string, string | null>();
  for (const id of profileIds) emails.set(id, null);
  if (profileIds.length === 0) return emails;

  const remaining = new Set(profileIds);
  for (let page = 1; page <= 20 && remaining.size > 0; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) break;
    for (const user of data.users) {
      if (remaining.has(user.id)) {
        emails.set(user.id, user.email ?? null);
        remaining.delete(user.id);
      }
    }
    if (data.users.length < 200) break;
  }

  for (const id of remaining) {
    const { data } = await admin.auth.admin.getUserById(id);
    emails.set(id, data.user?.email ?? null);
  }
  return emails;
}

function userIsSignInDisabled(user: {
  banned_until?: string | null;
} | null): boolean {
  if (!user?.banned_until) return false;
  const until = Date.parse(user.banned_until);
  if (Number.isNaN(until)) return true;
  return until > Date.now();
}

export class PlatformAdminServerService {
  constructor(
    private readonly repo = new PlatformAdminRepository(),
    private readonly admin: AdminClient = createAdminClient()
  ) {}

  async listOrganisations(
    ctx: PlatformAdminContext
  ): Promise<OrganisationAdminRecord[]> {
    void ctx;
    return this.repo.listOrganisations();
  }

  async listIdentities(
    ctx: PlatformAdminContext,
    organisationId?: string
  ): Promise<PlatformIdentityAdminRecord[]> {
    void ctx;
    const rows = await this.repo.listIdentities(organisationId);
    const profileIds = rows.map((row) => row.profile.id);
    const [access, emails] = await Promise.all([
      this.repo.loadIdentityAccess(profileIds),
      loadAuthEmailMap(this.admin, profileIds),
    ]);

    return rows.map((row) => ({
      profileId: row.profile.id,
      email: emails.get(row.profile.id) ?? null,
      fullName: row.profile.full_name,
      firstName: row.profile.first_name,
      lastName: row.profile.last_name,
      organisationId: row.profile.organisation_id,
      organisationSlug: row.organisation?.slug ?? null,
      organisationName: row.organisation?.name ?? null,
      status: row.profile.status,
      platformCapabilities: access.platformCaps.get(row.profile.id) ?? [],
      operationalIdentity: access.identityLinks.get(row.profile.id) ?? null,
      financeWorkspaceGrantPresent: access.financeGrantPresent.has(
        row.profile.id
      ),
    }));
  }

  /**
   * ADMINISTRATOR-CREATED ACCOUNT (the normal onboarding path — there is no invitation email).
   *
   * Establishes the canonical chain through the existing mechanisms, in order:
   *   Supabase Auth identity (server-side Admin API, email pre-confirmed, NO email sent)
   *   → profile (existing trigger) → organisation attachment (existing RPC)
   *   → access scope → landing workspace → facility assignment (+ canonical FM package for an active
   *     facility_manager) → explicit capability grants → audit.
   *
   * The Auth identity is created with a server-generated TEMPORARY password and `must_change_password`. The password
   * is returned once in the result; it is never stored, logged, audited or placed in any metadata that can be read
   * back. If a later step fails the account exists but nobody knows its password: finish the setup and use Issue
   * Temporary Password.
   */
  async createAccount(
    ctx: PlatformAdminContext,
    input: {
      email: string;
      fullName: string;
      firstName?: string;
      lastName?: string;
      organisationId: string;
      accessScope: unknown;
      homeModule?: unknown;
      landingWorkspace?: unknown;
      facilityAssignment?: { facilityId: string; operationalRole: unknown } | null;
      capabilityPackage?: unknown;
      capabilities?: unknown[];
    }
  ): Promise<CreateAccountResult> {
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    if (!email || !email.includes("@") || !fullName) {
      throw new ActionError("VALIDATION_ERROR", "A valid email and full name are required.");
    }
    const organisation = await this.repo.getOrganisationById(input.organisationId);
    if (!organisation) throw new ActionError("VALIDATION_ERROR", "Organisation not found.");
    if (organisation.status !== "active") throw new ActionError("ORGANISATION_INACTIVE");

    // Validate EVERYTHING before the identity exists, so a bad request creates nothing.
    const { accessScope, homeModule } = input;
    if (accessScope !== "platform" && accessScope !== "module") {
      throw new ActionError("VALIDATION_ERROR", "Access scope must be platform or module.");
    }
    if (accessScope === "platform" && homeModule != null && homeModule !== "") {
      throw new ActionError("VALIDATION_ERROR", "Platform scope cannot have a home module.");
    }
    if (accessScope === "module" && !isBoundModule(homeModule)) {
      throw new ActionError("VALIDATION_ERROR", "Module-bound scope requires a supported home module.");
    }
    const landingRaw = input.landingWorkspace == null || input.landingWorkspace === "" ? null : input.landingWorkspace;
    if (landingRaw !== null && (!isLandingWorkspace(landingRaw) || accessScope !== "platform")) {
      throw new ActionError("VALIDATION_ERROR", "A landing workspace applies only to platform-scope accounts and must be supported.");
    }
    const capabilityPackage = input.capabilityPackage == null || input.capabilityPackage === "" ? null : input.capabilityPackage;
    if (capabilityPackage !== null && capabilityPackage !== "facility_manager") {
      throw new ActionError("VALIDATION_ERROR", "Unknown capability package.");
    }
    let assignment: { facilityId: string; operationalRole: string } | null = null;
    // Facility context belongs to Facility Management (and to platform-scope accounts, which may work across
    // modules). A home whose domain has no facility context — ECC Operations, Platform Finance — never carries a
    // facility assignment or an FM operating role.
    if (input.facilityAssignment && accessScope === "module" && !workspaceEntry(homeModule as string)?.facilityContext) {
      throw new ActionError("VALIDATION_ERROR", `${workspaceLabel(homeModule as string)} has no facility context: a facility assignment and FM operating role do not apply.`);
    }
    if (input.facilityAssignment) {
      const role = parseOperationalRole(input.facilityAssignment.operationalRole);
      assignment = { facilityId: input.facilityAssignment.facilityId, operationalRole: role };
    }
    if (capabilityPackage === "facility_manager" && assignment?.operationalRole !== "facility_manager") {
      throw new ActionError("VALIDATION_ERROR", "The Facility Manager package requires an active facility_manager facility assignment.");
    }
    const explicit = [...new Set(input.capabilities ?? [])];
    for (const capability of explicit) {
      if (!isPlatformAdministrableCapability(capability)) {
        throw new ActionError("VALIDATION_ERROR", "A requested capability is not administrable on the platform control plane.");
      }
    }
    if (await findAuthUserIdByEmail(this.admin, email)) {
      throw new ActionError("VALIDATION_ERROR", "An account with this email already exists. Use Issue Temporary Password for an existing account.");
    }

    const temporaryPassword = generateTemporaryPassword();
    const { data: created, error: createError } = await this.admin.auth.admin.createUser({
      email,
      password: temporaryPassword,
      // Pre-confirmed: creating an account triggers NO confirmation / invitation / magic-link email.
      email_confirm: true,
      user_metadata: { full_name: fullName, first_name: input.firstName, last_name: input.lastName },
      app_metadata: { [MUST_CHANGE_PASSWORD_KEY]: true },
    });
    if (createError || !created.user) {
      // Never echo anything derived from the credential.
      throw new ActionError("VALIDATION_ERROR", createError?.message?.replace(temporaryPassword, "") || "Unable to create the account.");
    }
    const profileId = created.user.id;
    const completed: string[] = ["auth_identity"];
    const fail = (step: string, error: unknown): never => {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new ActionError(
        "INTERNAL_ERROR",
        `The account was created but setup stopped at "${step}" (${message.replace(temporaryPassword, "")}). Nobody knows its password: complete the setup, then use Issue Temporary Password.`,
        { details: { profileId, completed } }
      );
    };

    try {
      const attached = await this.repo.attachInvitedProfile({
        email,
        organisationSlug: organisation.slug,
        fullName,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      completed.push("organisation_attachment");
      await this.repo.insertAuditEvent({
        organisationId: attached.organisationId,
        actorProfileId: ctx.actorProfileId,
        action: "profile.attached_to_organisation",
        objectType: "profile",
        objectId: profileId,
        details: { organisationSlug: attached.organisationSlug, email },
      });
    } catch (error) {
      fail("organisation_attachment", error);
    }
    try {
      if (accessScope === "module") {
        await this.setAccessScope(ctx, { profileId, accessScope, homeModule });
        completed.push("access_scope");
      }
      if (landingRaw !== null) {
        await this.setLandingWorkspace(ctx, { profileId, landingWorkspace: landingRaw });
        completed.push("landing_workspace");
      }
    } catch (error) {
      fail("access_scope", error);
    }
    try {
      if (assignment) {
        // For an ACTIVE facility_manager this also applies the canonical Facility Manager package (audited grants).
        await this.setFacilityAssignment(ctx, {
          organisationId: organisation.id,
          profileId,
          facilityId: assignment.facilityId,
          operationalRole: assignment.operationalRole,
          status: "active",
        });
        completed.push("facility_assignment");
      }
    } catch (error) {
      fail("facility_assignment", error);
    }
    try {
      for (const capability of explicit) {
        await this.repo.grantPlatformCapability({
          actorProfileId: ctx.actorProfileId,
          organisationId: organisation.id,
          targetProfileId: profileId,
          capability: capability as PlatformAdministrableCapability,
        });
      }
      completed.push("capability_grants");
    } catch (error) {
      fail("capability_grants", error);
    }

    const held = await this.heldCapabilities(organisation.id, profileId);
    // The audit records WHO created WHOM and with what — never any credential.
    await this.repo.insertAuditEvent({
      organisationId: organisation.id,
      actorProfileId: ctx.actorProfileId,
      action: "user.account_created",
      objectType: "profile",
      objectId: profileId,
      details: {
        email,
        accessScope,
        homeModule: accessScope === "module" ? (homeModule as string) : null,
        landingWorkspace: landingRaw,
        facilityId: assignment?.facilityId ?? null,
        operationalRole: assignment?.operationalRole ?? null,
        capabilityPackage,
        capabilities: held,
        credentialDelivery: "administrator_one_time",
        mustChangePassword: true,
      },
    });

    return {
      profileId,
      email,
      organisationId: organisation.id,
      temporaryPassword,
      mustChangePassword: true,
      accessScope,
      homeModule: accessScope === "module" ? (homeModule as string) : null,
      landingWorkspace: landingRaw,
      assignment,
      capabilityPackage: capabilityPackage as "facility_manager" | null,
      grantedCapabilities: held,
      authEmailSent: false,
    };
  }

  /**
   * Issue a NEW temporary password to an existing, active account and require a password change at next sign-in.
   * Replaces the credential through the trusted Admin API; the old password stops working. The plaintext is returned
   * once and never stored, logged or audited. An administrator can never retrieve an existing password, cannot
   * reissue their own, and cannot reissue for a deactivated account (reactivate first).
   */
  async issueTemporaryPassword(
    ctx: PlatformAdminContext,
    input: { profileId: string }
  ): Promise<IssueTemporaryPasswordResult> {
    if (input.profileId === ctx.actorProfileId) {
      throw new ActionError("VALIDATION_ERROR", "You cannot issue a temporary password to your own account. Use the password reset on the sign-in page.");
    }
    const profile = await this.repo.getProfile(input.profileId);
    if (!profile) throw new ActionError("PROFILE_NOT_FOUND");
    if (profile.status !== "active" || !profile.organisation_id) {
      throw new ActionError("VALIDATION_ERROR", "A temporary password can only be issued to an active, organisation-attached account. Reactivate or attach the account first.");
    }
    const { data: authUser, error: readError } = await this.admin.auth.admin.getUserById(input.profileId);
    if (readError || !authUser.user) throw new ActionError("VALIDATION_ERROR", "The sign-in identity could not be found.");
    if (userIsSignInDisabled(authUser.user)) {
      throw new ActionError("VALIDATION_ERROR", "This account's sign-in is disabled. Reactivate it before issuing a temporary password.");
    }
    const temporaryPassword = generateTemporaryPassword();
    const { error } = await this.admin.auth.admin.updateUserById(input.profileId, {
      password: temporaryPassword,
      app_metadata: { [MUST_CHANGE_PASSWORD_KEY]: true },
    });
    if (error) throw new ActionError("INTERNAL_ERROR", "The temporary password could not be issued.");
    await this.repo.insertAuditEvent({
      organisationId: profile.organisation_id,
      actorProfileId: ctx.actorProfileId,
      action: "user.temporary_password_issued",
      objectType: "profile",
      objectId: input.profileId,
      details: { credentialDelivery: "administrator_one_time", mustChangePassword: true },
    });
    return { profileId: input.profileId, email: authUser.user.email ?? "", temporaryPassword, mustChangePassword: true };
  }

  async attachProfileToOrganisation(
    ctx: PlatformAdminContext,
    input: { email: string; organisationId: string }
  ): Promise<AttachProfileResult> {
    const email = input.email.trim().toLowerCase();
    if (!email) {
      throw new ActionError("VALIDATION_ERROR", "email is required.");
    }
    const organisation = await this.repo.getOrganisationById(input.organisationId);
    if (!organisation) {
      throw new ActionError("VALIDATION_ERROR", "Organisation not found.");
    }
    if (organisation.status !== "active") {
      throw new ActionError("ORGANISATION_INACTIVE");
    }

    const attached = await this.repo.attachInvitedProfile({
      email,
      organisationSlug: organisation.slug,
    });
    if (attached.changed) {
      await this.repo.insertAuditEvent({
        organisationId: attached.organisationId,
        actorProfileId: ctx.actorProfileId,
        action: "profile.attached_to_organisation",
        objectType: "profile",
        objectId: attached.userId,
        details: { organisationSlug: attached.organisationSlug, email },
      });
    }
    return {
      email,
      profileId: attached.userId,
      organisationId: attached.organisationId,
      attached: true,
      alreadyExisted: !attached.changed,
      followUpRequired: [],
    };
  }

  async setProfileStatus(
    ctx: PlatformAdminContext,
    input: { profileId: string; status: unknown }
  ): Promise<ProfileStatusResult> {
    if (!isProfileStatus(input.status) || input.status === "invited") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Status must be active, inactive, or suspended."
      );
    }
    const current = await this.repo.getProfile(input.profileId);
    if (!current) {
      throw new ActionError("VALIDATION_ERROR", "Profile not found.");
    }
    if (!isAllowedProfileStatusTransition(current.status, input.status)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        `Status transition ${current.status} → ${input.status} is not allowed.`
      );
    }

    const updated = await this.repo.setProfileStatus({
      actorProfileId: ctx.actorProfileId,
      targetProfileId: input.profileId,
      status: input.status,
    });

    const disable = profileStatusRequiresAuthDisable(updated.status);
    const authResult = await this.setAuthSignInDisabled(updated.profileId, disable);

    return {
      ...updated,
      authSignInDisabled: authResult.disabled,
    };
  }

  async setAccessScope(
    ctx: PlatformAdminContext,
    input: { profileId: string; accessScope: unknown; homeModule: unknown }
  ): Promise<AccessScopeResult> {
    const { accessScope, homeModule } = input;
    if (accessScope !== "platform" && accessScope !== "module") {
      throw new ActionError("VALIDATION_ERROR", "Access scope must be platform or module.");
    }
    if (accessScope === "platform" && homeModule != null && homeModule !== "") {
      throw new ActionError("VALIDATION_ERROR", "Platform scope cannot have a home module.");
    }
    if (accessScope === "module" && !isBoundModule(homeModule)) {
      throw new ActionError("VALIDATION_ERROR", "Module-bound scope requires a supported home module.");
    }
    const current = await this.repo.getProfile(input.profileId);
    if (!current) {
      throw new ActionError("VALIDATION_ERROR", "Profile not found.");
    }
    if (input.profileId === ctx.actorProfileId && accessScope === "module") {
      throw new ActionError("VALIDATION_ERROR", "You cannot module-bind your own identity.");
    }
    return this.repo.setAccessScope({
      actorProfileId: ctx.actorProfileId,
      targetProfileId: input.profileId,
      accessScope,
      homeModule: accessScope === "module" ? (homeModule as string) : null,
    });
  }

  /** FM facility scope (WHERE) — independent of capability grants (WHAT). */
  async setFmFacilityScope(
    ctx: PlatformAdminContext,
    input: { profileId: string; fmFacilityScope: unknown }
  ): Promise<FmFacilityScopeResult> {
    if (input.fmFacilityScope !== "assigned" && input.fmFacilityScope !== "all") {
      throw new ActionError("VALIDATION_ERROR", "Facility scope must be assigned or all.");
    }
    const current = await this.repo.getProfile(input.profileId);
    if (!current) {
      throw new ActionError("VALIDATION_ERROR", "Profile not found.");
    }
    return this.repo.setFmFacilityScope({
      actorProfileId: ctx.actorProfileId,
      targetProfileId: input.profileId,
      fmFacilityScope: input.fmFacilityScope,
    });
  }

  async setLandingWorkspace(
    ctx: PlatformAdminContext,
    input: { profileId: string; landingWorkspace: unknown }
  ): Promise<LandingWorkspaceResult> {
    const raw = input.landingWorkspace;
    const value = raw == null || raw === "" ? null : raw;
    if (value !== null && !isLandingWorkspace(value)) {
      throw new ActionError("VALIDATION_ERROR", "Unsupported landing workspace.");
    }
    const current = await this.repo.getProfile(input.profileId);
    if (!current) {
      throw new ActionError("VALIDATION_ERROR", "Profile not found.");
    }
    return this.repo.setLandingWorkspace({
      actorProfileId: ctx.actorProfileId,
      targetProfileId: input.profileId,
      landingWorkspace: value,
    });
  }

  async setOrganisationModule(
    ctx: PlatformAdminContext,
    input: {
      organisationId: string;
      moduleSlug: string;
      status: "enabled" | "disabled";
    }
  ): Promise<OrganisationModuleResult> {
    const slug = input.moduleSlug.trim();
    if (!slug) {
      throw new ActionError("VALIDATION_ERROR", "moduleSlug is required.");
    }
    if (input.status !== "enabled" && input.status !== "disabled") {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Module status must be enabled or disabled."
      );
    }
    return this.repo.setOrganisationModule({
      actorProfileId: ctx.actorProfileId,
      organisationId: input.organisationId,
      moduleSlug: slug,
      status: input.status,
    });
  }

  async grantPlatformCapability(
    ctx: PlatformAdminContext,
    input: {
      organisationId: string;
      profileId: string;
      capability: unknown;
    }
  ): Promise<PlatformCapabilityGrantResult> {
    if (!isPlatformAdministrableCapability(input.capability)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Capability is not administrable on the platform control plane."
      );
    }
    return this.repo.grantPlatformCapability({
      actorProfileId: ctx.actorProfileId,
      organisationId: input.organisationId,
      targetProfileId: input.profileId,
      capability: input.capability,
    });
  }

  async revokePlatformCapability(
    ctx: PlatformAdminContext,
    input: {
      organisationId: string;
      profileId: string;
      capability: unknown;
    }
  ): Promise<PlatformCapabilityGrantResult> {
    if (!isPlatformAdministrableCapability(input.capability)) {
      throw new ActionError(
        "VALIDATION_ERROR",
        "Capability is not administrable on the platform control plane."
      );
    }
    return this.repo.revokePlatformCapability({
      actorProfileId: ctx.actorProfileId,
      organisationId: input.organisationId,
      targetProfileId: input.profileId,
      capability: input.capability,
    });
  }

  /**
   * Batch capability edit for Admin Console Access → Edit access: a single administrator confirmation applies
   * every grant and revoke from one edit session in one server-side call. Not a new SQL transaction — each item
   * still goes through the SAME audited, per-capability platform_iam_grant_platform_capability /
   * platform_iam_revoke_platform_capability RPC as a standalone change (same actor/allowlist/tenant checks,
   * same audit row per change), applied sequentially. This reuses the existing, already-proven multi-grant
   * pattern (see applyFacilityManagerOperatingPackage below) rather than adding a new SQL surface — the
   * capability set is small and per-item failure must remain individually visible and reconcilable, which a
   * single atomic transaction would hide (an all-or-nothing rollback cannot tell the caller which one item was
   * the problem). Every capability is validated against the administrable allowlist BEFORE anything is
   * written, and grant/revoke may not both target the same capability — both reject the whole batch with no
   * side effects. Once validated, a failure on one item never aborts the rest.
   */
  async batchUpdateCapabilities(
    ctx: PlatformAdminContext,
    input: {
      organisationId: string;
      profileId: string;
      grant: unknown[];
      revoke: unknown[];
    }
  ): Promise<PlatformCapabilityBatchResult> {
    const grant = Array.isArray(input.grant) ? input.grant : [];
    const revoke = Array.isArray(input.revoke) ? input.revoke : [];
    for (const capability of [...grant, ...revoke]) {
      if (!isPlatformAdministrableCapability(capability)) {
        throw new ActionError(
          "VALIDATION_ERROR",
          `Capability "${String(capability)}" is not administrable on the platform control plane.`
        );
      }
    }
    const grantSet = new Set(grant as PlatformAdministrableCapability[]);
    const revokeSet = new Set(revoke as PlatformAdministrableCapability[]);
    for (const capability of grantSet) {
      if (revokeSet.has(capability)) {
        throw new ActionError(
          "VALIDATION_ERROR",
          `Capability "${capability}" cannot be both granted and revoked in the same batch.`
        );
      }
    }

    const result: PlatformCapabilityBatchResult = { granted: [], revoked: [], failed: [] };
    for (const capability of grantSet) {
      try {
        await this.repo.grantPlatformCapability({
          actorProfileId: ctx.actorProfileId,
          organisationId: input.organisationId,
          targetProfileId: input.profileId,
          capability,
        });
        result.granted.push(capability);
      } catch (error) {
        result.failed.push({
          capability,
          action: "grant",
          message: error instanceof ActionError ? error.message : "The grant could not be applied.",
        });
      }
    }
    for (const capability of revokeSet) {
      try {
        await this.repo.revokePlatformCapability({
          actorProfileId: ctx.actorProfileId,
          organisationId: input.organisationId,
          targetProfileId: input.profileId,
          capability,
        });
        result.revoked.push(capability);
      } catch (error) {
        result.failed.push({
          capability,
          action: "revoke",
          message: error instanceof ActionError ? error.message : "The revoke could not be applied.",
        });
      }
    }
    return result;
  }

  /** The capabilities a profile currently holds in an organisation (explicit grants only). */
  private async heldCapabilities(organisationId: string, profileId: string): Promise<string[]> {
    const { data, error } = await this.admin
      .from("platform_capability_grants")
      .select("capability")
      .eq("organisation_id", organisationId)
      .eq("profile_id", profileId);
    if (error) throw new ActionError("INTERNAL_ERROR", "Unable to read the profile's capability grants.");
    return (data ?? []).map((row) => String((row as { capability: string }).capability));
  }

  /**
   * Apply the canonical Facility Manager operating package to one profile: grant ONLY the package capabilities
   * the profile does not already hold, through the audited, idempotent platform_iam_grant_platform_capability RPC
   * (the same mechanism as the Admin Console). Protected authority is never part of the package.
   */
  async applyFacilityManagerOperatingPackage(
    ctx: PlatformAdminContext,
    input: { organisationId: string; profileId: string }
  ): Promise<{ profileId: string; granted: string[]; alreadyHeld: string[] }> {
    const held = await this.heldCapabilities(input.organisationId, input.profileId);
    const gaps = facilityManagerPackageGaps(held);
    const granted: string[] = [];
    for (const capability of gaps) {
      const result = await this.repo.grantPlatformCapability({
        actorProfileId: ctx.actorProfileId,
        organisationId: input.organisationId,
        targetProfileId: input.profileId,
        capability,
      });
      if (result.changed) granted.push(capability);
    }
    return { profileId: input.profileId, granted, alreadyHeld: held.filter((c) => !gaps.includes(c as never)) };
  }

  /**
   * Reconcile EVERY active Facility Manager (active profile, active facility_manager assignment) with the canonical
   * package. `apply: false` is a read-only report of what is missing. Idempotent.
   */
  async reconcileFacilityManagerPackages(
    ctx: PlatformAdminContext,
    input: { organisationId: string; apply: boolean }
  ): Promise<Array<{ profileId: string; missing: string[]; granted: string[] }>> {
    const { data, error } = await this.admin
      .from("fm_facility_assignments")
      .select("profile_id")
      .eq("organisation_id", input.organisationId)
      .eq("operational_role", "facility_manager")
      .eq("status", "active");
    if (error) throw new ActionError("INTERNAL_ERROR", "Unable to read facility assignments.");
    const profileIds = [...new Set((data ?? []).map((r) => String((r as { profile_id: string }).profile_id)))];
    const out: Array<{ profileId: string; missing: string[]; granted: string[] }> = [];
    for (const profileId of profileIds) {
      const { data: profile } = await this.admin.from("profiles").select("status, organisation_id").eq("id", profileId).maybeSingle();
      if (!profile || (profile as { status: string }).status !== "active" || (profile as { organisation_id: string }).organisation_id !== input.organisationId) continue;
      const missing = facilityManagerPackageGaps(await this.heldCapabilities(input.organisationId, profileId));
      const applied = input.apply && missing.length ? await this.applyFacilityManagerOperatingPackage(ctx, { organisationId: input.organisationId, profileId }) : null;
      out.push({ profileId, missing, granted: applied?.granted ?? [] });
    }
    return out;
  }

  /**
   * Operating-context administration: assign a profile to a facility, change the
   * operational role, or (de)activate an assignment. The operational role itself
   * derives NO authority at runtime; making a profile an ACTIVE Facility Manager
   * applies the canonical Facility Manager operating package as explicit, audited
   * grants (see facilityManagerPackage.ts). Every assignment change is audited
   * atomically by the fm_facility_assignments trigger (actor = the acting Super Admin).
   */
  async setFacilityAssignment(
    ctx: PlatformAdminContext,
    input: {
      organisationId: string;
      profileId: string;
      facilityId: string;
      operationalRole: unknown;
      status?: unknown;
      assignmentId?: string;
    }
  ): Promise<FacilityAssignmentResult> {
    const organisation = await this.repo.getOrganisationById(input.organisationId);
    if (!organisation) throw new ActionError("VALIDATION_ERROR", "Organisation not found.");
    if (organisation.status !== "active") throw new ActionError("ORGANISATION_INACTIVE");
    const target = await this.repo.getProfile(input.profileId);
    if (!target) throw new ActionError("PROFILE_NOT_FOUND");
    if (target.organisation_id !== input.organisationId) {
      throw new ActionError("VALIDATION_ERROR", "Profile is not attached to the requested organisation.");
    }
    const people = new FmPeopleRepository(input.organisationId, this.admin);
    try {
      const role = parseOperationalRole(input.operationalRole);
      const status = parseAssignmentStatus(input.status);
      if (input.assignmentId) {
        const existing = await people.getAssignment(input.assignmentId);
        if (!existing || existing.profile_id !== input.profileId) {
          throw new ActionError("VALIDATION_ERROR", "Assignment not found for this person.");
        }
        const row = await people.updateAssignment(existing.id, { role, status }, ctx.actorProfileId);
        await this.applyPackageIfActiveFacilityManager(ctx, input.organisationId, row);
        return { assignmentId: row.id, profileId: row.profile_id, facilityId: row.facility_id, operationalRole: row.operational_role, status: row.status === "active" ? "active" : "inactive" };
      }
      const row = await people.createAssignment({ profileId: input.profileId, facilityId: input.facilityId, role, status, actorProfileId: ctx.actorProfileId });
      await this.applyPackageIfActiveFacilityManager(ctx, input.organisationId, row);
      return { assignmentId: row.id, profileId: row.profile_id, facilityId: row.facility_id, operationalRole: row.operational_role, status: row.status === "active" ? "active" : "inactive" };
    } catch (error) {
      if (error instanceof FmPeopleValidationError || error instanceof FmPeopleNotFoundError) {
        throw new ActionError("VALIDATION_ERROR", error.message);
      }
      if (error instanceof FmPeopleUnavailableError) throw new ActionError("INTERNAL_ERROR", error.message);
      throw error;
    }
  }

  private async applyPackageIfActiveFacilityManager(
    ctx: PlatformAdminContext,
    organisationId: string,
    row: { profile_id: string; operational_role: string; status: string }
  ): Promise<void> {
    if (row.operational_role !== "facility_manager" || row.status !== "active") return;
    await this.applyFacilityManagerOperatingPackage(ctx, { organisationId, profileId: row.profile_id });
  }

  reader(): AdminConsoleReader {
    return new AdminConsoleReader(this.admin);
  }

  async offboardUser(
    ctx: PlatformAdminContext,
    input: { profileId: string }
  ): Promise<OffboardResult> {
    if (input.profileId === ctx.actorProfileId) {
      throw new ActionError(
        "FORBIDDEN",
        "Cannot offboard the acting Super Admin."
      );
    }

    const before = await this.repo.getProfile(input.profileId);
    if (!before) {
      throw new ActionError("VALIDATION_ERROR", "Profile not found.");
    }

    const db = await this.repo.offboardProfile({
      actorProfileId: ctx.actorProfileId,
      targetProfileId: input.profileId,
    });

    const followUpRequired: PlatformAdminFollowUp[] = [];
    const auth = await this.setAuthSignInDisabled(input.profileId, true);
    if (!auth.ok) {
      followUpRequired.push("auth_sign_in_disable");
    }

    const fmState =
      db.revoked.fmFacilityAssignmentsInactivated > 0 ||
      db.revoked.operationalIdentityLinksInactivated > 0
        ? "deactivated"
        : "not_applicable";

    const fullyOffboarded = db.platformAccessRevoked && auth.ok;

    return {
      profileId: db.profileId,
      organisationId: db.organisationId,
      previousStatus: db.previousStatus,
      status: "inactive",
      platformAccessRevoked: db.platformAccessRevoked,
      authSignInDisabled: auth.ok,
      fmOperationalIdentityDeactivated: fmState,
      followUpRequired,
      fullyOffboarded,
      revoked: db.revoked,
    };
  }

  /**
   * Reversible GoTrue ban. Never deletes the Auth user.
   * ban_duration "none" lifts the ban on reactivation.
   */
  private async setAuthSignInDisabled(
    userId: string,
    disabled: boolean
  ): Promise<{ ok: boolean; disabled: boolean | null }> {
    const { data: existing } = await this.admin.auth.admin.getUserById(userId);
    if (!existing.user) {
      return { ok: false, disabled: null };
    }
    const alreadyDisabled = userIsSignInDisabled(existing.user);
    if (disabled === alreadyDisabled) {
      return { ok: true, disabled: alreadyDisabled };
    }

    const { data, error } = await this.admin.auth.admin.updateUserById(userId, {
      ban_duration: disabled
        ? PLATFORM_AUTH_SIGN_IN_DISABLE_BAN_DURATION
        : "none",
    });
    if (error || !data.user) {
      return { ok: false, disabled: alreadyDisabled };
    }
    const confirmed = disabled
      ? true
      : !userIsSignInDisabled(
          data.user as { banned_until?: string | null } | null
        );
    return { ok: confirmed, disabled: disabled ? true : false };
  }
}

export type { ProfileStatus };
