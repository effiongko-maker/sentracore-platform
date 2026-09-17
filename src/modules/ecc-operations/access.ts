import {
  ECC_CAPABILITIES,
  ECC_MODULE_SLUG,
  ECC_WORKSPACE_ID,
  type EccModuleContext,
} from "./types";

/**
 * Access / module foundations for ECC Operations.
 *
 * Organisation enablement: organisation_modules.status for `ecc_operations`.
 * User enter/use: explicit platform.ecc_operations.view in platform_capability_grants.
 * These layers are independent — module on ≠ user access.
 */
export const ECC_ACCESS = {
  moduleSlug: ECC_MODULE_SLUG,
  workspaceId: ECC_WORKSPACE_ID,
  capabilities: ECC_CAPABILITIES,
} as const;

export function eccModuleContext(): EccModuleContext {
  return {
    moduleSlug: ECC_MODULE_SLUG,
    workspaceId: ECC_WORKSPACE_ID,
  };
}
