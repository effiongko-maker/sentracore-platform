import { hasModule } from "@/lib/actions/moduleAccess";
import { ActionError } from "@/lib/actions/errors";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import { getPlatformSession } from "@/lib/auth/session";
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

/**
 * Session + active org + module enabled (SA may bypass module enablement only).
 * Capability must exist in finance_capability_grants — SA does not auto-receive capabilities.
 * When companyId is provided, finance_company_access is required — SA does not bypass.
 */
export async function requirePlatformFinanceAccess(
  options: RequirePlatformFinanceAccessOptions
): Promise<PlatformFinanceAccessContext> {
  const session = await getPlatformSession();
  if (!session) {
    throw new ActionError("UNAUTHENTICATED");
  }

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
    const { data: accessRow, error: accessError } = await admin
      .from("finance_company_access")
      .select("id")
      .eq("company_id", options.companyId)
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
      .eq("id", options.companyId)
      .maybeSingle();

    if (companyError) {
      throw new ActionError("INTERNAL_ERROR", "Unable to load finance company.");
    }
    if (!company || company.organisation_id !== organisationId) {
      throw new ActionError("FORBIDDEN", "Finance company not in your organisation.");
    }
  }

  return {
    session,
    organisationId,
    profileId,
    capability: options.capability,
    companyId: options.companyId,
  };
}
