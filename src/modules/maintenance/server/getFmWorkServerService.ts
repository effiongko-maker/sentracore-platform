import "server-only";
import { requirePlatformSession } from "@/lib/auth/session";
import { resolveOperatingAccess } from "@/lib/access/server";
import {
  FmWorkServerService,
  resolveFmWorkOrganisation,
} from "./FmWorkServerService";

/**
 * Server-side Work service for Action Engine / orchestration.
 * Uses the authenticated platform session — never Apps Script Maintenance.
 */
export async function getFmWorkServerService(): Promise<FmWorkServerService> {
  const session = await requirePlatformSession();
  const access = await resolveOperatingAccess(session);
  const { organisationId, profileId } = resolveFmWorkOrganisation(session);
  return new FmWorkServerService({
    session,
    access,
    organisationId,
    profileId,
  });
}
