import type { AuthEnabledModule } from "@/lib/auth/types";
import { ActionError } from "./errors";
import type { PlatformModuleSlug } from "./types";

/**
 * Return the enabled module row or throw MODULE_NOT_ENABLED.
 */
export function requireModule(
  enabledModules: AuthEnabledModule[],
  moduleSlug: PlatformModuleSlug
): AuthEnabledModule {
  const match = enabledModules.find(
    (m) => m.slug === moduleSlug && m.status === "enabled"
  );

  if (!match) {
    throw new ActionError("MODULE_NOT_ENABLED");
  }

  return match;
}

export function hasModule(
  enabledModules: AuthEnabledModule[],
  moduleSlug: PlatformModuleSlug
): boolean {
  return enabledModules.some(
    (m) => m.slug === moduleSlug && m.status === "enabled"
  );
}
