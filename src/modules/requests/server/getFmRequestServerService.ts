import "server-only";
import { requirePlatformSession } from "@/lib/auth/session";
import { resolveOperatingAccess } from "@/lib/access/server";
import {
  FmRequestServerService,
  resolveFmRequestOrganisation,
} from "./FmRequestServerService";

/**
 * Session-backed Request service for orchestration and server actions.
 * Never touches Apps Script.
 */
export async function getFmRequestServerService(): Promise<FmRequestServerService> {
  const session = await requirePlatformSession();
  const access = await resolveOperatingAccess(session);
  const { organisationId, profileId } = resolveFmRequestOrganisation(session);
  return new FmRequestServerService({
    organisationId,
    profileId,
    session,
    access,
  });
}
