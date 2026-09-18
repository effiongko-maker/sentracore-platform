import { hasModule } from "@/lib/actions/moduleAccess";
import { ActionError } from "@/lib/actions/errors";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import { getPlatformSession } from "@/lib/auth/session";
import { assertActiveProfileForBusinessAccess } from "@/lib/auth/assertActiveProfile";
import type { PlatformSession } from "@/lib/auth/types";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  PLATFORM_FINANCE_MODULE_SLUG,
  type PlatformFinanceCapability,
} from "@/modules/platform-finance/types";

export type PlatformFinanceAccessContext = {
  session: PlatformSession;
  organisationId: string;
  profileId: string;
  capability: PlatformFinanceCapability;
  companyId?: string;
};

export type RequirePlatformFinanceAccessOptions = {
  capability: PlatformFinanceCapability;
  companyId?: string;
};

export type RequirePlatformFinanceAccessAnyOptions = {
  capabilities: readonly PlatformFinanceCapability[];
  companyId?: string;
};

async function resolvePlatformFinanceSessionContext(): Promise<{
  session: PlatformSession;
  organisationId: string;
  profileId: string;
}> {
  const session = await getPlatformSession();
  if (!session) {
    throw new ActionError("UNAUTHENTICATED");
  }
  assertActiveProfileForBusinessAccess(session);

  const organisationId =
    session.organisation?.id ?? session.profile.organisationId ?? null;
  if (!organisationId) {
    throw new ActionError("ORGANISATION_NOT_FOUND");
  }

  if (session.organisation && session.organisation.status !== "active") {
    throw new ActionError("ORGANISATION_INACTIVE");
  }

  const profileId = session.profile.id;
  if (!profileId) {
    throw new ActionError("PROFILE_NOT_FOUND");
  }

  const isSuperAdmin = isPlatformSuperAdminFromSlugs(session.roleSlugs);
  if (
    !isSuperAdmin &&
    !hasModule(session.enabledModules, PLATFORM_FINANCE_MODULE_SLUG)
  ) {
    throw new ActionError("MODULE_NOT_ENABLED");
  }

  return { session, organisationId, profileId };
}

async function assertFinanceCompanyAccess(
  organisationId: string,
  profileId: string,
  companyId: string
): Promise<void> {
  const admin = createAdminClient();
  const { data: accessRow, error: accessError } = await admin
    .from("finance_company_access")
    .select("id")
    .eq("company_id", companyId)
    .eq("profile_id", profileId)
    .maybeSingle();

  if (accessError) {
    throw new ActionError(
      "INTERNAL_ERROR",
      "Unable to verify finance company access."
    );
  }
  if (!accessRow) {
    throw new ActionError(
      "FORBIDDEN",
      "You do not have access to this finance company."
    );
  }

  const { data: company, error: companyError } = await admin
    .from("finance_companies")
    .select("id, organisation_id")
    .eq("id", companyId)
    .maybeSingle();

  if (companyError) {
    throw new ActionError("INTERNAL_ERROR", "Unable to load finance company.");
  }
  if (!company || company.organisation_id !== organisationId) {
    throw new ActionError("FORBIDDEN", "Finance company not in your organisation.");
  }
}

/**
 * Session + active org + module enabled (SA may bypass module enablement only).
 * At least one finance_capability_grants row required to enter the Platform Finance
 * workspace shell — does not require a specific action capability.
 * Action APIs still use requirePlatformFinanceAccess / AccessAny for their caps.
 * Super Admin does not auto-receive finance capabilities.
 */
export async function requirePlatformFinanceWorkspaceAccess(): Promise<{
  session: PlatformSession;
  organisationId: string;
  profileId: string;
}> {
  const { session, organisationId, profileId } =
    await resolvePlatformFinanceSessionContext();

  const admin = createAdminClient();
  const { data: capRows, error: capError } = await admin
    .from("finance_capability_grants")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .limit(1);

  if (capError) {
    throw new ActionError(
      "INTERNAL_ERROR",
      "Unable to verify finance workspace access."
    );
  }
  if (!capRows?.length) {
    throw new ActionError(
      "FORBIDDEN",
      "You do not have Platform Finance access for this organisation."
    );
  }

  return { session, organisationId, profileId };
}

/**
 * Session + active org + module enabled (SA may bypass module enablement only).
 * Capability must exist in finance_capability_grants — SA does not auto-receive capabilities.
 * When companyId is provided, finance_company_access is required — SA does not bypass.
 */
export async function requirePlatformFinanceAccess(
  options: RequirePlatformFinanceAccessOptions
): Promise<PlatformFinanceAccessContext> {
  const { session, organisationId, profileId } =
    await resolvePlatformFinanceSessionContext();

  const admin = createAdminClient();

  const { data: capRow, error: capError } = await admin
    .from("finance_capability_grants")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("capability", options.capability)
    .maybeSingle();

  if (capError) {
    throw new ActionError("INTERNAL_ERROR", "Unable to verify finance capability.");
  }
  if (!capRow) {
    throw new ActionError(
      "FORBIDDEN",
      `Missing capability ${options.capability}.`
    );
  }

  if (options.companyId) {
    await assertFinanceCompanyAccess(
      organisationId,
      profileId,
      options.companyId
    );
  }

  return {
    session,
    organisationId,
    profileId,
    capability: options.capability,
    companyId: options.companyId,
  };
}

/**
 * Same session/org/company rules as requirePlatformFinanceAccess, but accepts
 * any one of the listed capabilities (first matching grant wins).
 */
export async function requirePlatformFinanceAccessAny(
  options: RequirePlatformFinanceAccessAnyOptions
): Promise<PlatformFinanceAccessContext> {
  if (!options.capabilities.length) {
    throw new ActionError("INTERNAL_ERROR", "No capabilities specified.");
  }

  const { session, organisationId, profileId } =
    await resolvePlatformFinanceSessionContext();

  const admin = createAdminClient();
  const { data: capRows, error: capError } = await admin
    .from("finance_capability_grants")
    .select("capability")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .in("capability", [...options.capabilities]);

  if (capError) {
    throw new ActionError("INTERNAL_ERROR", "Unable to verify finance capability.");
  }

  const granted = new Set((capRows ?? []).map((row) => row.capability));
  const matched = options.capabilities.find((cap) => granted.has(cap));
  if (!matched) {
    throw new ActionError(
      "FORBIDDEN",
      `Missing capability ${options.capabilities.join(" | ")}.`
    );
  }

  if (options.companyId) {
    await assertFinanceCompanyAccess(
      organisationId,
      profileId,
      options.companyId
    );
  }

  return {
    session,
    organisationId,
    profileId,
    capability: matched,
    companyId: options.companyId,
  };
}
