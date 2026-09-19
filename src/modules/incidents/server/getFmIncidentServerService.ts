import "server-only";
import { requirePlatformSession } from "@/lib/auth/session";
import { resolveOperatingAccess } from "@/lib/access/server";
import {
  FmIncidentServerService,
  resolveFmIncidentOrganisation,
} from "./FmIncidentServerService";

/**
 * Session-backed Incident service for orchestration and server actions.
 * Never touches Apps Script.
 */
export async function getFmIncidentServerService(): Promise<FmIncidentServerService> {
  const session = await requirePlatformSession();
  const access = await resolveOperatingAccess(session);
  const { organisationId, profileId } = resolveFmIncidentOrganisation(session);
  return new FmIncidentServerService({ organisationId, profileId, session, access });
}
