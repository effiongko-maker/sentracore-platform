import { hasModule } from "@/lib/actions/moduleAccess";
import { ActionError } from "@/lib/actions/errors";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import { getPlatformSession } from "@/lib/auth/session";
import { assertActiveProfileForBusinessAccess } from "@/lib/auth/assertActiveProfile";
import type { PlatformSession } from "@/lib/auth/types";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  ECC_CAPABILITIES,
  ECC_MODULE_SLUG,
  type EccCapability,
} from "@/modules/ecc-operations/types";

export type EccAccessContext = {
  session: PlatformSession;
  organisationId: string;
  profileId: string;
  capability: EccCapability;
};

export type RequireEccAccessOptions = {
  capability?: EccCapability;
};

/**
 * Session + active org + ecc_operations module (SA may bypass module only)
 * + explicit platform.ecc_operations.* grant.
 *
 * Super Admin does NOT auto-receive ECC capabilities
 * (same discipline as Platform Finance / Command Centre).
 */
export async function requireEccAccess(
  options: RequireEccAccessOptions = {}
): Promise<EccAccessContext> {
  const capability = options.capability ?? ECC_CAPABILITIES.view;
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
  if (!isSuperAdmin && !hasModule(session.enabledModules, ECC_MODULE_SLUG)) {
    throw new ActionError("MODULE_NOT_ENABLED");
  }

  const admin = createAdminClient();
  const { data: capRow, error: capError } = await admin
    .from("platform_capability_grants")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("capability", capability)
    .maybeSingle();

  if (capError) {
    throw new ActionError(
      "INTERNAL_ERROR",
      "Unable to verify ECC Operations capability."
    );
  }
  if (!capRow) {
    throw new ActionError("FORBIDDEN", `Missing capability ${capability}.`);
  }

  return { session, organisationId, profileId, capability };
}

export async function tryGetEccAccess(): Promise<EccAccessContext | null> {
  try {
    return await requireEccAccess();
  } catch {
    return null;
  }
}
