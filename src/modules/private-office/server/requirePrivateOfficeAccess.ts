import { ActionError } from "@/lib/actions/errors";
import { assertBoundaryAllows } from "@/lib/access/moduleBoundary";
import { assertActiveProfileForBusinessAccess } from "@/lib/auth/assertActiveProfile";
import { getPlatformSession } from "@/lib/auth/session";
import type { PlatformSession } from "@/lib/auth/types";
import { PRIVATE_OFFICE_CAPABILITIES } from "@/modules/private-office/types";
import { requireCommandCentreAccess } from "@/modules/command-centre/server/requireCommandCentreAccess";
import { createAdminClient } from "@/utils/supabase/admin";

export type PrivateOfficeAccessContext = {
  session: PlatformSession;
  organisationId: string;
  profileId: string;
};

/** Exactly one authority: the explicit grant, in this organisation, for this profile. No role, no override. */
async function readPrivateOfficeGrant(organisationId: string, profileId: string): Promise<boolean | null> {
  const { data, error } = await createAdminClient()
    .from("platform_capability_grants")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("capability", PRIVATE_OFFICE_CAPABILITIES.access)
    .maybeSingle();
  if (error) return null;
  return Boolean(data);
}

/**
 * Server gate for every Private Office surface. Private Office is reached through the executive
 * environment, so the rule is: the normal Executive Office gate (active platform-scope session, active
 * organisation, explicit command_centre.view) AND, independently, the explicit Private Office grant.
 * Neither implies the other. Super Admin and platform.admin_override are never consulted.
 */
export async function requirePrivateOfficeAccess(): Promise<PrivateOfficeAccessContext> {
  const base = await requireCommandCentreAccess();
  const granted = await readPrivateOfficeGrant(base.organisationId, base.profileId);
  if (granted === null) {
    throw new ActionError("INTERNAL_ERROR", "Unable to verify Private Office access.");
  }
  if (!granted) throw new ActionError("FORBIDDEN", "Not available.");
  return { session: base.session, organisationId: base.organisationId, profileId: base.profileId };
}

/**
 * Doorway check for the executive console: a boolean only — never any Private Office content.
 * Fails closed (false) on any doubt, so an unauthorised identity is never teased.
 */
export async function canEnterPrivateOffice(): Promise<boolean> {
  try {
    const session = await getPlatformSession();
    if (!session) return false;
    assertActiveProfileForBusinessAccess(session);
    assertBoundaryAllows(session, "platform");
    const organisationId = session.organisation?.id ?? session.profile.organisationId ?? null;
    const profileId = session.profile.id;
    if (!organisationId || !profileId) return false;
    return (await readPrivateOfficeGrant(organisationId, profileId)) === true;
  } catch {
    return false;
  }
}
