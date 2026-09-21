import { requireCommandCentreAccess, type CommandCentreAccessContext } from "@/modules/command-centre/server/requireCommandCentreAccess";
import { COMMAND_CENTRE_CAPABILITIES } from "@/modules/command-centre/types";
import { createAdminClient } from "@/utils/supabase/admin";

export type CommitmentCapabilities = { view: boolean; manage: boolean };

/** Explicit grants only. null = the grants could not be read (a failure, never "no access"). */
export async function readCommitmentCapabilities(
  organisationId: string,
  profileId: string
): Promise<CommitmentCapabilities | null> {
  const { data, error } = await createAdminClient()
    .from("platform_capability_grants")
    .select("capability")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .in("capability", [
      COMMAND_CENTRE_CAPABILITIES.commitmentsView,
      COMMAND_CENTRE_CAPABILITIES.commitmentsManage,
    ]);
  if (error) return null;
  const held = new Set((data ?? []).map((row) => String(row.capability)));
  return {
    view: held.has(COMMAND_CENTRE_CAPABILITIES.commitmentsView),
    manage: held.has(COMMAND_CENTRE_CAPABILITIES.commitmentsManage),
  };
}

/**
 * Server gate for commitment operations. Requires an active platform-scope session in an
 * active organisation with the explicit Command Centre view grant AND the specific commitments
 * capability. Managing additionally requires being able to view: you cannot manage what you
 * cannot see. Assignment of a commitment is never consulted here.
 */
export async function requireCommitmentsAccess(
  level: "view" | "manage"
): Promise<CommandCentreAccessContext> {
  const access = await requireCommandCentreAccess();
  await requireCommandCentreAccess({ capability: COMMAND_CENTRE_CAPABILITIES.commitmentsView });
  if (level === "manage") {
    await requireCommandCentreAccess({ capability: COMMAND_CENTRE_CAPABILITIES.commitmentsManage });
  }
  return access;
}
