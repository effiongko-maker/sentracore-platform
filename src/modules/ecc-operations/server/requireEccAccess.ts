import { hasModule } from "@/lib/actions/moduleAccess";
import { ActionError } from "@/lib/actions/errors";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import { getPlatformSession } from "@/lib/auth/session";
import type { PlatformSession } from "@/lib/auth/types";
import { ECC_MODULE_SLUG } from "@/modules/ecc-operations/types";

export type EccAccessContext = {
  session: PlatformSession;
  organisationId: string;
};

/**
 * Authenticated platform session + organisation membership + ecc_operations enabled.
 * Platform Super Admins may enter even when the module is not org-enabled.
 * Does not invent ECC-specific capabilities.
 */
export async function requireEccAccess(): Promise<EccAccessContext> {
  const session = await getPlatformSession();
  if (!session) {
    throw new ActionError("UNAUTHENTICATED");
  }

  const organisationId =
    session.organisation?.id ?? session.profile.organisationId ?? null;

  if (!organisationId) {
    throw new ActionError("ORGANISATION_NOT_FOUND");
  }

  if (session.organisation && session.organisation.status !== "active") {
    throw new ActionError("ORGANISATION_INACTIVE");
  }

  const isSuperAdmin = isPlatformSuperAdminFromSlugs(session.roleSlugs);
  if (!isSuperAdmin && !hasModule(session.enabledModules, ECC_MODULE_SLUG)) {
    throw new ActionError("MODULE_NOT_ENABLED");
  }

  return { session, organisationId };
}

export async function tryGetEccAccess(): Promise<EccAccessContext | null> {
  const session = await getPlatformSession();
  if (!session) return null;
  const organisationId =
    session.organisation?.id ?? session.profile.organisationId ?? null;
  if (!organisationId) return null;
  if (session.organisation && session.organisation.status !== "active") {
    return null;
  }
  const isSuperAdmin = isPlatformSuperAdminFromSlugs(session.roleSlugs);
  if (!isSuperAdmin && !hasModule(session.enabledModules, ECC_MODULE_SLUG)) {
    return null;
  }
  return { session, organisationId };
}
