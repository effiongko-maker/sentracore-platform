import { ActionError } from "@/lib/actions/errors";
import { isPlatformSuperAdminFromSlugs } from "@/lib/access/platformRoles";
import { getPlatformSession } from "@/lib/auth/session";
import type { PlatformSession } from "@/lib/auth/types";

export type PlatformAdminContext = {
  session: PlatformSession;
  actorProfileId: string;
};

/**
 * Server-side guard for platform user-lifecycle administration.
 * v1: Platform Super Admin only. Client actor IDs are never trusted.
 */
export async function requirePlatformAdmin(): Promise<PlatformAdminContext> {
  const session = await getPlatformSession();
  if (!session) {
    throw new ActionError("UNAUTHENTICATED");
  }
  if (session.profile.status !== "active") {
    throw new ActionError("FORBIDDEN", "Your profile is not active.");
  }
  if (!isPlatformSuperAdminFromSlugs(session.roleSlugs)) {
    throw new ActionError(
      "FORBIDDEN",
      "Platform Super Admin authority is required."
    );
  }
  return {
    session,
    actorProfileId: session.profile.id,
  };
}
