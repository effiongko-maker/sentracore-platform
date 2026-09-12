import {
  ECC_MODULE_SLUG,
  ECC_WORKSPACE_ID,
  type EccModuleContext,
} from "./types";

/**
 * Access / module foundations for ECC Operations.
 *
 * ECC-specific AccessCapability values are not defined yet.
 * Org enablement uses organisation_modules.status for `ecc_operations`.
 * Authenticated managers use the ECC workspace chrome; FM capabilities are not reused.
 */
export const ECC_ACCESS = {
  moduleSlug: ECC_MODULE_SLUG,
  workspaceId: ECC_WORKSPACE_ID,
} as const;

export function eccModuleContext(): EccModuleContext {
  return {
    moduleSlug: ECC_MODULE_SLUG,
    workspaceId: ECC_WORKSPACE_ID,
  };
}
