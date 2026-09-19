import "server-only";
import { requirePlatformSession } from "@/lib/auth/session";
import { resolveOperatingAccess } from "@/lib/access/server";
import { FmApprovalServerService, resolveFmApprovalOrganisation } from "./FmApprovalServerService";

/** Session-backed Approval service for server actions. Never Apps Script. */
export async function getFmApprovalServerService(): Promise<FmApprovalServerService> {
  const session = await requirePlatformSession();
  const access = await resolveOperatingAccess(session);
  const { organisationId, profileId } = resolveFmApprovalOrganisation(session);
  return new FmApprovalServerService({ organisationId, profileId, session, access });
}
