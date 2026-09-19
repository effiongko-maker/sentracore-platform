import "server-only";
import { requirePlatformSession } from "@/lib/auth/session";
import { resolveOperatingAccess } from "@/lib/access/server";
import {
  FmWorkInstructionServerService,
  resolveFmWorkInstructionOrganisation,
} from "./FmWorkInstructionServerService";

/** Session-backed Work Instruction service for orchestration and server actions. Never Apps Script. */
export async function getFmWorkInstructionServerService(): Promise<FmWorkInstructionServerService> {
  const session = await requirePlatformSession();
  const access = await resolveOperatingAccess(session);
  const { organisationId, profileId } = resolveFmWorkInstructionOrganisation(session);
  return new FmWorkInstructionServerService({ organisationId, profileId, session, access });
}
