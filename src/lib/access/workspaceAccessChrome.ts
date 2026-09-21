import { createAdminClient } from "@/utils/supabase/admin";
import { hasModule } from "@/lib/actions/moduleAccess";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import type { AuthEnabledModule } from "@/lib/auth/types";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import { accessCan } from "@/lib/access/resolveAccess";
import { boundaryAllows, type ModuleBoundary } from "@/lib/access/moduleBoundary";
import { COMMAND_CENTRE_CAPABILITIES } from "@/modules/command-centre/types";
import { ECC_CAPABILITIES, ECC_MODULE_SLUG } from "@/modules/ecc-operations/types";
import { PLATFORM_FINANCE_MODULE_SLUG } from "@/modules/platform-finance/types";

/**
 * Client chrome flags for workspace enterability.
 * Server route/API gates remain authoritative — these are UX only.
 */
export type WorkspaceAccessChrome = {
  /** Org module facility_management enabled (or SA). */
  facilityManagement: boolean;
  /** Org module ecc_operations (or SA) AND platform.ecc_operations.view grant. */
  eccOperations: boolean;
  /** Org module platform_finance (or SA) AND any finance_capability_grants row. */
  platformFinance: boolean;
  /** Explicit platform.command_centre.view grant. */
  commandCentre: boolean;
};

export async function resolveWorkspaceAccessChrome(input: {
  organisationId: string;
  profileId: string;
  roleSlugs: string[];
  enabledModules: AuthEnabledModule[];
  operatingAccess: OperatingAccess;
  /** The identity's module boundary — module-bound users only ever see their home workspace. */
  boundary: ModuleBoundary;
}): Promise<WorkspaceAccessChrome> {
  const isSuperAdmin = isPlatformSuperAdminFromSlugs(input.roleSlugs);
  const admin = createAdminClient();

  const [{ data: platformCaps }, { data: financeCaps }] = await Promise.all([
    admin
      .from("platform_capability_grants")
      .select("capability")
      .eq("organisation_id", input.organisationId)
      .eq("profile_id", input.profileId)
      .in("capability", [
        COMMAND_CENTRE_CAPABILITIES.view,
        ECC_CAPABILITIES.view,
      ]),
    admin
      .from("finance_capability_grants")
      .select("id")
      .eq("organisation_id", input.organisationId)
      .eq("profile_id", input.profileId)
      .limit(1),
  ]);

  const platformSet = new Set(
    (platformCaps ?? []).map((row) => String(row.capability))
  );
  const hasEccGrant = platformSet.has(ECC_CAPABILITIES.view);
  const hasCommandCentreGrant = platformSet.has(
    COMMAND_CENTRE_CAPABILITIES.view
  );
  const hasAnyFinanceGrant = (financeCaps ?? []).length > 0;

  const eccModuleOn =
    isSuperAdmin || hasModule(input.enabledModules, ECC_MODULE_SLUG);
  const financeModuleOn =
    isSuperAdmin ||
    hasModule(input.enabledModules, PLATFORM_FINANCE_MODULE_SLUG);
  const fmModuleOn =
    isSuperAdmin ||
    hasModule(input.enabledModules, "facility_management");

  return {
    facilityManagement:
      boundaryAllows(input.boundary, "facility_management") &&
      fmModuleOn &&
      accessCan(input.operatingAccess, "ops.view"),
    eccOperations:
      boundaryAllows(input.boundary, "ecc_operations") &&
      eccModuleOn &&
      hasEccGrant,
    platformFinance:
      boundaryAllows(input.boundary, "platform_finance") &&
      financeModuleOn &&
      hasAnyFinanceGrant,
    commandCentre:
      boundaryAllows(input.boundary, "platform") && hasCommandCentreGrant,
  };
}
