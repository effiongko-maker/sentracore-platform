import type { AuthEnabledModule } from "@/lib/auth/types";
import { getPlatformSession } from "@/lib/auth/session";
import { resolveOperatingAccess } from "@/lib/access/server";
import type { OperatingAccess } from "@/lib/access/resolveAccess";
import {
  resolveWorkspaceAccessChrome,
  type WorkspaceAccessChrome,
} from "@/lib/access/workspaceAccessChrome";

/**
 * Server-only chrome bootstrap for the authenticated (app) shell.
 * Resolves platform session chrome and operating access with a single
 * getPlatformSession() read (operating access reuses that session).
 */
export type AppAccessBootstrap = {
  sessionChrome: {
    enabledModules: AuthEnabledModule[];
    roleSlugs: string[];
    workspaceAccess: WorkspaceAccessChrome;
  } | null;
  operatingAccess: OperatingAccess | null;
};

export async function bootstrapAppAccess(): Promise<AppAccessBootstrap> {
  const session = await getPlatformSession();
  if (!session) {
    return { sessionChrome: null, operatingAccess: null };
  }

  const organisationId =
    session.organisation?.id ?? session.profile.organisationId ?? null;
  const operatingAccess = await resolveOperatingAccess(session);

  let workspaceAccess: WorkspaceAccessChrome = {
    facilityManagement: false,
    eccOperations: false,
    platformFinance: false,
    commandCentre: false,
  };

  if (organisationId && session.profile.id) {
    workspaceAccess = await resolveWorkspaceAccessChrome({
      organisationId,
      profileId: session.profile.id,
      roleSlugs: session.roleSlugs,
      enabledModules: session.enabledModules,
      operatingAccess,
    });
  }

  return {
    sessionChrome: {
      enabledModules: session.enabledModules,
      roleSlugs: session.roleSlugs,
      workspaceAccess,
    },
    operatingAccess,
  };
}
