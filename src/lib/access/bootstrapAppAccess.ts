import type { AuthEnabledModule } from "@/lib/auth/types";
import { getPlatformSession } from "@/lib/auth/session";
import { resolveOperatingAccess } from "@/lib/access/server";
import type { OperatingAccess } from "@/lib/access/resolveAccess";

/**
 * Server-only chrome bootstrap for the authenticated (app) shell.
 * Resolves platform session chrome and operating access with a single
 * getPlatformSession() read (operating access reuses that session).
 */
export type AppAccessBootstrap = {
  sessionChrome: {
    enabledModules: AuthEnabledModule[];
    roleSlugs: string[];
  } | null;
  operatingAccess: OperatingAccess | null;
};

export async function bootstrapAppAccess(): Promise<AppAccessBootstrap> {
  const session = await getPlatformSession();
  if (!session) {
    return { sessionChrome: null, operatingAccess: null };
  }

  const operatingAccess = await resolveOperatingAccess(session);

  return {
    sessionChrome: {
      enabledModules: session.enabledModules,
      roleSlugs: session.roleSlugs,
    },
    operatingAccess,
  };
}
