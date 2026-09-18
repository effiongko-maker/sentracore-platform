import { ActionError } from "@/lib/actions/errors";
import { createAdminClient } from "@/utils/supabase/admin";
import { postToAppsScriptData } from "@/services/api/appsScriptProxy";
import type { ProfileStatus } from "@/lib/auth/types";
import {
  isAllowedProfileStatusTransition,
  isProfileStatus,
  profileStatusRequiresAuthDisable,
} from "../domain/profileStatus";
import {
  isPlatformAdministrableCapability,
  PLATFORM_AUTH_SIGN_IN_DISABLE_BAN_DURATION,
  type InviteAttachResult,
  type OffboardResult,
  type OrganisationAdminRecord,
  type OrganisationModuleResult,
  type PlatformAdminFollowUp,
  type PlatformCapabilityGrantResult,
  type PlatformIdentityAdminRecord,
  type ProfileStatusResult,
} from "../types";
import { PlatformAdminRepository } from "./PlatformAdminRepository";
import type { PlatformAdminContext } from "./requirePlatformAdmin";

type AdminClient = ReturnType<typeof createAdminClient>;

function isExistingUserError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("already") ||
    lower.includes("registered") ||
    lower.includes("exists")
  );
}

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

  async inviteAndAttachUser(
    ctx: PlatformAdminContext,
    input: {
      email: string;
      fullName: string;
      organisationId: string;
      firstName?: string;
      lastName?: string;
      redirectOrigin: string;
    }
  ): Promise<InviteAttachResult> {
    const email = input.email.trim().toLowerCase();
    const fullName = input.fullName.trim();
    if (!email || !fullName) {
      throw new ActionError("VALIDATION_ERROR", "email and fullName are required.");
    }

    const organisation = await this.repo.getOrganisationById(input.organisationId);
    if (!organisation) {
      throw new ActionError("VALIDATION_ERROR", "Organisation not found.");
    }
    if (organisation.status !== "active") {
      throw new ActionError("ORGANISATION_INACTIVE");
    }

    const followUpRequired: PlatformAdminFollowUp[] = [];
    let inviteSent = false;
    let alreadyExisted = false;
    let profileId: string | null = null;

    const { data: invited, error: inviteError } =
      await this.admin.auth.admin.inviteUserByEmail(email, {
        redirectTo: `${input.redirectOrigin}/auth/callback`,
        data: {
          full_name: fullName,
          first_name: input.firstName,
          last_name: input.lastName,
        },
      });

    if (!inviteError && invited.user) {
      inviteSent = true;
      profileId = invited.user.id;
      await this.repo.insertAuditEvent({
        organisationId: organisation.id,
        actorProfileId: ctx.actorProfileId,
        action: "user.invited",
        objectType: "profile",
        objectId: invited.user.id,
        details: { email },
      });
    } else if (inviteError && isExistingUserError(inviteError.message)) {
      alreadyExisted = true;
      profileId = await findAuthUserIdByEmail(this.admin, email);
      if (!profileId) {
        throw new ActionError(
          "VALIDATION_ERROR",
          "Auth user already exists but could not be resolved."
        );
      }
    } else {
      throw new ActionError(
        "VALIDATION_ERROR",
        inviteError?.message ?? "Unable to invite user."
      );
    }

    try {
      const attached = await this.repo.attachInvitedProfile({
        email,
        organisationSlug: organisation.slug,
        fullName,
        firstName: input.firstName,
        lastName: input.lastName,
      });
      profileId = attached.userId;
      if (attached.changed) {
        await this.repo.insertAuditEvent({
          organisationId: attached.organisationId,
          actorProfileId: ctx.actorProfileId,
          action: "profile.attached_to_organisation",
          objectType: "profile",
          objectId: attached.userId,
          details: {
            organisationSlug: attached.organisationSlug,
            email,
          },
        });
      }
      return {
        email,
        profileId,
        organisationId: attached.organisationId,
        inviteSent,
        attached: true,
        alreadyExisted,
        followUpRequired,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      if (/different organisation/i.test(message)) {
        throw error instanceof ActionError
          ? error
          : new ActionError("VALIDATION_ERROR", message);
      }
      followUpRequired.push("profile_organisation_attachment");
      return {
        email,
        profileId,
        organisationId: organisation.id,
        inviteSent,
        attached: false,
        alreadyExisted,
        followUpRequired,
      };
    }
  }

  async attachProfileToOrganisation(
    ctx: PlatformAdminContext,
    input: { email: string; organisationId: string }
  ): Promise<InviteAttachResult> {
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
      inviteSent: false,
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

    const fm = await this.deactivateLinkedFmPerson(input.profileId);
    if (fm.state === "failed") {
      followUpRequired.push("fm_people_deactivate");
    }

    const fullyOffboarded =
      db.platformAccessRevoked && auth.ok && fm.state !== "failed";

    return {
      profileId: db.profileId,
      organisationId: db.organisationId,
      previousStatus: db.previousStatus,
      status: "inactive",
      platformAccessRevoked: db.platformAccessRevoked,
      authSignInDisabled: auth.ok,
      fmOperationalIdentityDeactivated: fm.state,
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

  private async deactivateLinkedFmPerson(
    profileId: string
  ): Promise<{ state: "deactivated" | "not_applicable" | "failed"; message?: string }> {
    const { data: link, error } = await this.admin
      .from("operational_identity_links")
      .select("external_identity_id, status")
      .eq("profile_id", profileId)
      .eq("identity_domain", "facility_management")
      .maybeSingle();

    if (error) {
      return { state: "failed", message: error.message };
    }
    if (!link?.external_identity_id) {
      return { state: "not_applicable" };
    }

    try {
      await postToAppsScriptData(
        {
          resource: "users",
          action: "deactivate",
          payload: { id: String(link.external_identity_id) },
        },
        { resource: "users", action: "deactivate" },
        "platform-admin/fm-people-deactivate"
      );
      return { state: "deactivated" };
    } catch (caught) {
      return {
        state: "failed",
        message:
          caught instanceof Error ? caught.message : "People deactivate failed.",
      };
    }
  }
}

export type { ProfileStatus };
