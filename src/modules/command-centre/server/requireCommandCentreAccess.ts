import { assertBoundaryAllows } from "@/lib/access/moduleBoundary";
import { ActionError } from "@/lib/actions/errors";
import { getPlatformSession } from "@/lib/auth/session";
import { assertActiveProfileForBusinessAccess } from "@/lib/auth/assertActiveProfile";
import type { PlatformSession } from "@/lib/auth/types";
import { createAdminClient } from "@/utils/supabase/admin";
import {
  COMMAND_CENTRE_CAPABILITIES,
  type CommandCentreCapability,
} from "@/modules/command-centre/types";

export type CommandCentreAccessContext = {
  session: PlatformSession;
  organisationId: string;
  profileId: string;
  capability: CommandCentreCapability;
};

export type RequireCommandCentreAccessOptions = {
  capability?: CommandCentreCapability;
};

export type RequireCommandCentreAccessAnyOptions = {
  capabilities: readonly CommandCentreCapability[];
};

async function resolveCommandCentreSessionContext(): Promise<{
  session: PlatformSession;
  organisationId: string;
  profileId: string;
}> {
  const session = await getPlatformSession();
  if (!session) {
    throw new ActionError("UNAUTHENTICATED");
  }
  assertActiveProfileForBusinessAccess(session);
  // Platform-wide surface: unavailable to module-bound identities regardless of grants.
  assertBoundaryAllows(session, "platform");

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

  return { session, organisationId, profileId };
}

/**
 * Session + active org + explicit platform.command_centre.* grant.
 *
 * Super Admin does NOT auto-receive Command Centre capabilities
 * (same discipline as Platform Finance capability grants).
 * Does NOT grant Finance capabilities or finance_company_access.
 */
export async function requireCommandCentreAccess(
  options: RequireCommandCentreAccessOptions = {}
): Promise<CommandCentreAccessContext> {
  const capability = options.capability ?? COMMAND_CENTRE_CAPABILITIES.view;
  const { session, organisationId, profileId } =
    await resolveCommandCentreSessionContext();

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
      "Unable to verify Command Centre capability."
    );
  }
  if (!capRow) {
    throw new ActionError("FORBIDDEN", `Missing capability ${capability}.`);
  }

  return {
    session,
    organisationId,
    profileId,
    capability,
  };
}

/**
 * Same session/org rules as requireCommandCentreAccess, but accepts any one
 * of the listed Command Centre capabilities (first matching grant wins).
 */
export async function requireCommandCentreAccessAny(
  options: RequireCommandCentreAccessAnyOptions
): Promise<CommandCentreAccessContext> {
  if (!options.capabilities.length) {
    throw new ActionError("INTERNAL_ERROR", "No capabilities specified.");
  }

  const { session, organisationId, profileId } =
    await resolveCommandCentreSessionContext();

  const admin = createAdminClient();
  const { data: capRows, error: capError } = await admin
    .from("platform_capability_grants")
    .select("capability")
    .eq("organisation_id", organisationId)
    .eq("profile_id", profileId)
    .in("capability", [...options.capabilities]);

  if (capError) {
    throw new ActionError(
      "INTERNAL_ERROR",
      "Unable to verify Command Centre capability."
    );
  }

  const granted = new Set((capRows ?? []).map((row) => row.capability));
  const matched = options.capabilities.find((cap) => granted.has(cap));
  if (!matched) {
    throw new ActionError(
      "FORBIDDEN",
      `Missing capability ${options.capabilities.join(" | ")}.`
    );
  }

  return {
    session,
    organisationId,
    profileId,
    capability: matched,
  };
}
