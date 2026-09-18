import { ActionError } from "@/lib/actions/errors";
import { createAdminClient } from "@/utils/supabase/admin";
import type { ProfileStatus } from "@/lib/auth/types";
import type {
  OrganisationAdminRecord,
  OrganisationModuleAdminStatus,
  OrganisationModuleResult,
  PlatformAdministrableCapability,
  PlatformCapabilityGrantResult,
} from "../types";

type AdminClient = ReturnType<typeof createAdminClient>;

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function rpcError(error: { message?: string; code?: string } | null, fallback: string): never {
  const message = error?.message?.trim() || fallback;
  const lower = message.toLowerCase();
  if (
    lower.includes("already linked") ||
    lower.includes("different organisation") ||
    lower.includes("not allowed") ||
    lower.includes("not administrable") ||
    lower.includes("unknown or inactive module") ||
    lower.includes("grant-only")
  ) {
    throw new ActionError("VALIDATION_ERROR", message);
  }
  if (
    lower.includes("not platform_super_admin") ||
    lower.includes("not attached") ||
    lower.includes("not active") ||
    lower.includes("cannot offboard")
  ) {
    throw new ActionError("FORBIDDEN", message);
  }
  if (lower.includes("not found")) {
    throw new ActionError("VALIDATION_ERROR", message);
  }
  throw new ActionError("INTERNAL_ERROR", message);
}

export class PlatformAdminRepository {
  constructor(private readonly admin: AdminClient = createAdminClient()) {}

  async listOrganisations(): Promise<OrganisationAdminRecord[]> {
    const { data: orgs, error: orgError } = await this.admin
      .from("organisations")
      .select("id, name, slug, status")
      .order("name");
    if (orgError) {
      throw new ActionError("INTERNAL_ERROR", "Unable to list organisations.");
    }

    const { data: catalog, error: catalogError } = await this.admin
      .from("modules")
      .select("id, name, slug, status")
      .eq("status", "active")
      .order("name");
    if (catalogError) {
      throw new ActionError("INTERNAL_ERROR", "Unable to list modules.");
    }

    const { data: rows, error: moduleError } = await this.admin
      .from("organisation_modules")
      .select("organisation_id, status, modules ( slug, name )");
    if (moduleError) {
      throw new ActionError("INTERNAL_ERROR", "Unable to list organisation modules.");
    }

    const byOrg = new Map<string, OrganisationAdminRecord["modules"]>();
    for (const row of rows ?? []) {
      const rec = row as Record<string, unknown>;
      const orgId = String(rec.organisation_id);
      const modRaw = rec.modules;
      const mod = Array.isArray(modRaw) ? asRecord(modRaw[0]) : asRecord(modRaw);
      if (!mod) continue;
      const list = byOrg.get(orgId) ?? [];
      list.push({
        slug: String(mod.slug),
        name: String(mod.name),
        status: String(rec.status) as OrganisationModuleAdminStatus,
      });
      byOrg.set(orgId, list);
    }

    const catalogModules = (catalog ?? []).map((mod) => ({
      slug: String(mod.slug),
      name: String(mod.name),
    }));

    return (orgs ?? []).map((org) => {
      const configured = byOrg.get(String(org.id)) ?? [];
      const configuredSlugs = new Set(configured.map((m) => m.slug));
      const modules = [
        ...configured,
        ...catalogModules
          .filter((m) => !configuredSlugs.has(m.slug))
          .map((m) => ({
            slug: m.slug,
            name: m.name,
            status: "disabled" as const,
          })),
      ];
      return {
        id: String(org.id),
        name: String(org.name),
        slug: String(org.slug),
        status: String(org.status),
        modules,
      };
    });
  }

  async getOrganisationById(organisationId: string): Promise<{
    id: string;
    name: string;
    slug: string;
    status: string;
  } | null> {
    const { data, error } = await this.admin
      .from("organisations")
      .select("id, name, slug, status")
      .eq("id", organisationId)
      .maybeSingle();
    if (error) {
      throw new ActionError("INTERNAL_ERROR", "Unable to load organisation.");
    }
    if (!data) return null;
    return {
      id: String(data.id),
      name: String(data.name),
      slug: String(data.slug),
      status: String(data.status),
    };
  }

  async listIdentities(organisationId?: string): Promise<
    Array<{
      profile: {
        id: string;
        first_name: string | null;
        last_name: string | null;
        full_name: string | null;
        organisation_id: string | null;
        status: ProfileStatus;
      };
      organisation: { id: string; name: string; slug: string } | null;
    }>
  > {
    let query = this.admin
      .from("profiles")
      .select(
        "id, first_name, last_name, full_name, organisation_id, status, organisations ( id, name, slug )"
      )
      .order("created_at", { ascending: false });
    if (organisationId) {
      query = query.eq("organisation_id", organisationId);
    }
    const { data, error } = await query;
    if (error) {
      throw new ActionError("INTERNAL_ERROR", "Unable to list platform identities.");
    }
    return (data ?? []).map((row) => {
      const rec = row as Record<string, unknown>;
      const orgRaw = rec.organisations;
      const org = Array.isArray(orgRaw) ? asRecord(orgRaw[0]) : asRecord(orgRaw);
      return {
        profile: {
          id: String(rec.id),
          first_name: rec.first_name ? String(rec.first_name) : null,
          last_name: rec.last_name ? String(rec.last_name) : null,
          full_name: rec.full_name ? String(rec.full_name) : null,
          organisation_id: rec.organisation_id ? String(rec.organisation_id) : null,
          status: String(rec.status) as ProfileStatus,
        },
        organisation: org
          ? {
              id: String(org.id),
              name: String(org.name),
              slug: String(org.slug),
            }
          : null,
      };
    });
  }

  async loadIdentityAccess(profileIds: string[]): Promise<{
    platformCaps: Map<string, string[]>;
    financeGrantPresent: Set<string>;
    identityLinks: Map<
      string,
      { domain: string; externalIdentityId: string; status: string }
    >;
  }> {
    const platformCaps = new Map<string, string[]>();
    const financeGrantPresent = new Set<string>();
    const identityLinks = new Map<
      string,
      { domain: string; externalIdentityId: string; status: string }
    >();
    if (profileIds.length === 0) {
      return { platformCaps, financeGrantPresent, identityLinks };
    }

    const [{ data: caps }, { data: financeCaps }, { data: links }] = await Promise.all([
      this.admin
        .from("platform_capability_grants")
        .select("profile_id, capability")
        .in("profile_id", profileIds),
      this.admin
        .from("finance_capability_grants")
        .select("profile_id")
        .in("profile_id", profileIds),
      this.admin
        .from("operational_identity_links")
        .select("profile_id, identity_domain, external_identity_id, status")
        .in("profile_id", profileIds),
    ]);

    for (const row of caps ?? []) {
      const profileId = String(row.profile_id);
      const list = platformCaps.get(profileId) ?? [];
      list.push(String(row.capability));
      platformCaps.set(profileId, list);
    }
    for (const row of financeCaps ?? []) {
      financeGrantPresent.add(String(row.profile_id));
    }
    for (const row of links ?? []) {
      identityLinks.set(String(row.profile_id), {
        domain: String(row.identity_domain),
        externalIdentityId: String(row.external_identity_id),
        status: String(row.status),
      });
    }

    return { platformCaps, financeGrantPresent, identityLinks };
  }

  async getProfile(profileId: string): Promise<{
    id: string;
    organisation_id: string | null;
    status: ProfileStatus;
    full_name: string | null;
  } | null> {
    const { data, error } = await this.admin
      .from("profiles")
      .select("id, organisation_id, status, full_name")
      .eq("id", profileId)
      .maybeSingle();
    if (error) {
      throw new ActionError("INTERNAL_ERROR", "Unable to load profile.");
    }
    if (!data) return null;
    return {
      id: String(data.id),
      organisation_id: data.organisation_id ? String(data.organisation_id) : null,
      status: String(data.status) as ProfileStatus,
      full_name: data.full_name ? String(data.full_name) : null,
    };
  }

  async insertAuditEvent(input: {
    organisationId: string | null;
    actorProfileId: string;
    action: string;
    objectType: string;
    objectId: string;
    details?: Record<string, unknown>;
  }): Promise<void> {
    const { error } = await this.admin.rpc("platform_iam_insert_audit_event", {
      p_organisation_id: input.organisationId,
      p_actor_profile_id: input.actorProfileId,
      p_action: input.action,
      p_object_type: input.objectType,
      p_object_id: input.objectId,
      p_details: input.details ?? {},
    });
    if (error) rpcError(error, "Unable to record IAM audit event.");
  }

  async attachInvitedProfile(input: {
    email: string;
    organisationSlug: string;
    fullName?: string | null;
    firstName?: string | null;
    lastName?: string | null;
  }): Promise<{
    userId: string;
    organisationId: string;
    organisationSlug: string;
    status: string;
    changed: boolean;
  }> {
    const { data, error } = await this.admin.rpc(
      "attach_invited_profile_to_organisation",
      {
        p_email: input.email,
        p_organisation_slug: input.organisationSlug,
        p_full_name: input.fullName ?? null,
        p_first_name: input.firstName ?? null,
        p_last_name: input.lastName ?? null,
      }
    );
    if (error) rpcError(error, "Unable to attach profile to organisation.");
    const rec = asRecord(data);
    if (!rec) {
      throw new ActionError("INTERNAL_ERROR", "Attach RPC returned no data.");
    }
    return {
      userId: String(rec.userId),
      organisationId: String(rec.organisationId),
      organisationSlug: String(rec.organisationSlug),
      status: String(rec.status),
      changed: Boolean(rec.changed),
    };
  }

  async setProfileStatus(input: {
    actorProfileId: string;
    targetProfileId: string;
    status: ProfileStatus;
  }): Promise<{
    profileId: string;
    organisationId: string | null;
    status: ProfileStatus;
    previousStatus: ProfileStatus;
    changed: boolean;
  }> {
    const { data, error } = await this.admin.rpc("platform_iam_set_profile_status", {
      p_actor_profile_id: input.actorProfileId,
      p_target_profile_id: input.targetProfileId,
      p_status: input.status,
    });
    if (error) rpcError(error, "Unable to update profile status.");
    const rec = asRecord(data);
    if (!rec) {
      throw new ActionError("INTERNAL_ERROR", "Status RPC returned no data.");
    }
    return {
      profileId: String(rec.profileId),
      organisationId: rec.organisationId ? String(rec.organisationId) : null,
      status: String(rec.status) as ProfileStatus,
      previousStatus: String(rec.previousStatus) as ProfileStatus,
      changed: Boolean(rec.changed),
    };
  }

  async setOrganisationModule(input: {
    actorProfileId: string;
    organisationId: string;
    moduleSlug: string;
    status: "enabled" | "disabled";
  }): Promise<OrganisationModuleResult> {
    const { data, error } = await this.admin.rpc(
      "platform_iam_set_organisation_module",
      {
        p_actor_profile_id: input.actorProfileId,
        p_organisation_id: input.organisationId,
        p_module_slug: input.moduleSlug,
        p_status: input.status,
      }
    );
    if (error) rpcError(error, "Unable to update organisation module.");
    const rec = asRecord(data);
    if (!rec) {
      throw new ActionError("INTERNAL_ERROR", "Module RPC returned no data.");
    }
    return {
      organisationId: String(rec.organisationId),
      moduleSlug: String(rec.moduleSlug),
      status: rec.status === "enabled" ? "enabled" : "disabled",
      changed: Boolean(rec.changed),
    };
  }

  async grantPlatformCapability(input: {
    actorProfileId: string;
    organisationId: string;
    targetProfileId: string;
    capability: PlatformAdministrableCapability;
  }): Promise<PlatformCapabilityGrantResult> {
    const { data, error } = await this.admin.rpc(
      "platform_iam_grant_platform_capability",
      {
        p_actor_profile_id: input.actorProfileId,
        p_organisation_id: input.organisationId,
        p_target_profile_id: input.targetProfileId,
        p_capability: input.capability,
      }
    );
    if (error) rpcError(error, "Unable to grant platform capability.");
    const rec = asRecord(data);
    if (!rec) {
      throw new ActionError("INTERNAL_ERROR", "Grant RPC returned no data.");
    }
    return {
      organisationId: String(rec.organisationId),
      profileId: String(rec.profileId),
      capability: rec.capability as PlatformAdministrableCapability,
      changed: Boolean(rec.changed),
    };
  }

  async revokePlatformCapability(input: {
    actorProfileId: string;
    organisationId: string;
    targetProfileId: string;
    capability: PlatformAdministrableCapability;
  }): Promise<PlatformCapabilityGrantResult> {
    const { data, error } = await this.admin.rpc(
      "platform_iam_revoke_platform_capability",
      {
        p_actor_profile_id: input.actorProfileId,
        p_organisation_id: input.organisationId,
        p_target_profile_id: input.targetProfileId,
        p_capability: input.capability,
      }
    );
    if (error) rpcError(error, "Unable to revoke platform capability.");
    const rec = asRecord(data);
    if (!rec) {
      throw new ActionError("INTERNAL_ERROR", "Revoke RPC returned no data.");
    }
    return {
      organisationId: String(rec.organisationId),
      profileId: String(rec.profileId),
      capability: rec.capability as PlatformAdministrableCapability,
      changed: Boolean(rec.changed),
    };
  }

  async offboardProfile(input: {
    actorProfileId: string;
    targetProfileId: string;
  }): Promise<{
    profileId: string;
    organisationId: string | null;
    previousStatus: ProfileStatus;
    status: "inactive";
    platformAccessRevoked: boolean;
    revoked: {
      financeCapabilityGrants: number;
      platformCapabilityGrants: number;
      financeCompanyAccess: number;
      financeFinancialAccountAccess: number;
      operationalIdentityLinksInactivated: number;
      fmFacilityAssignmentsInactivated: number;
    };
  }> {
    const { data, error } = await this.admin.rpc("platform_iam_offboard_profile", {
      p_actor_profile_id: input.actorProfileId,
      p_target_profile_id: input.targetProfileId,
    });
    if (error) rpcError(error, "Unable to offboard profile.");
    const rec = asRecord(data);
    if (!rec) {
      throw new ActionError("INTERNAL_ERROR", "Offboard RPC returned no data.");
    }
    const revoked = asRecord(rec.revoked) ?? {};
    return {
      profileId: String(rec.profileId),
      organisationId: rec.organisationId ? String(rec.organisationId) : null,
      previousStatus: String(rec.previousStatus) as ProfileStatus,
      status: "inactive",
      platformAccessRevoked: rec.platformAccessRevoked !== false,
      revoked: {
        financeCapabilityGrants: Number(revoked.financeCapabilityGrants ?? 0),
        platformCapabilityGrants: Number(revoked.platformCapabilityGrants ?? 0),
        financeCompanyAccess: Number(revoked.financeCompanyAccess ?? 0),
        financeFinancialAccountAccess: Number(
          revoked.financeFinancialAccountAccess ?? 0
        ),
        operationalIdentityLinksInactivated: Number(
          revoked.operationalIdentityLinksInactivated ?? 0
        ),
        fmFacilityAssignmentsInactivated: Number(
          revoked.fmFacilityAssignmentsInactivated ?? 0
        ),
      },
    };
  }
}
