import "server-only";
import { requirePlatformSession } from "@/lib/auth/session";
import { resolveOperatingAccess } from "@/lib/access/server";
import { FmCostServerService, resolveFmCostOrganisation } from "./FmCostServerService";

/** Session-backed FM Cost service for server code. Never Apps Script. */
export async function getFmCostServerService(): Promise<FmCostServerService> {
  const session = await requirePlatformSession();
  const access = await resolveOperatingAccess(session);
  const { organisationId, profileId } = resolveFmCostOrganisation(session);
  return new FmCostServerService({ organisationId, profileId, session, access });
}
