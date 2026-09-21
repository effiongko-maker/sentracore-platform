import { ActionError } from "@/lib/actions/errors";
import { assertBoundaryAllows } from "@/lib/access/moduleBoundary";
import { assertActiveProfileForBusinessAccess } from "@/lib/auth/assertActiveProfile";
import { getPlatformSession } from "@/lib/auth/session";
import type { PlatformSession } from "@/lib/auth/types";
import { BATCAVE_CAPABILITIES } from "@/modules/batcave/types";
import { requireCommandCentreAccess } from "@/modules/command-centre/server/requireCommandCentreAccess";
import { createAdminClient } from "@/utils/supabase/admin";

export type BatcaveAccessContext = {
  session: PlatformSession;
  organisationId: string;
  profileId: string;
};

/** Exactly one authority: the explicit grant, in this organisation, for this profile. No role, no override. */
async function readBatcaveGrant(organisationId: string, profileId: string): Promise<boolean | null> {
  const { data, error } = await createAdminClient()
    .from("platform_capability_grants")
    .select("id")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .eq("capability", BATCAVE_CAPABILITIES.access)
    .maybeSingle();
  if (error) return null;
  return Boolean(data);
}

/**
 * Server gate for every Batcave surface. Batcave is reached through the executive environment,
 * so the rule is: the normal Command Centre gate (active platform-scope session, active
 * organisation, explicit command_centre.view) AND, independently, the explicit Batcave grant.
 * Neither implies the other. Super Admin and platform.admin_override are never consulted.
 */
export async function requireBatcaveAccess(): Promise<BatcaveAccessContext> {
  const base = await requireCommandCentreAccess();
  const granted = await readBatcaveGrant(base.organisationId, base.profileId);
  if (granted === null) {
    throw new ActionError("INTERNAL_ERROR", "Unable to verify Batcave access.");
  }
  if (!granted) throw new ActionError("FORBIDDEN", "Not available.");
  return { session: base.session, organisationId: base.organisationId, profileId: base.profileId };
}

/**
 * Doorway check for the executive console: a boolean only — never any Batcave content.
 * Fails closed (false) on any doubt, so an unauthorised identity is never teased.
 */
export async function canEnterBatcave(): Promise<boolean> {
  try {
    const session = await getPlatformSession();
    if (!session) return false;
    assertActiveProfileForBusinessAccess(session);
    assertBoundaryAllows(session, "platform");
    const organisationId = session.organisation?.id ?? session.profile.organisationId ?? null;
    const profileId = session.profile.id;
    if (!organisationId || !profileId) return false;
    return (await readBatcaveGrant(organisationId, profileId)) === true;
  } catch {
    return false;
  }
}
