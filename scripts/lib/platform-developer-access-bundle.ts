/**
 * Platform developer / QA access bundle — single source of truth for explicit
 * grants used by scripts/grant-platform-developer-access.mts and seed.
 *
 * This is NOT an authorization bypass. Server helpers still require these
 * rows in finance_capability_grants / platform_capability_grants /
 * finance_company_access. Super Admin does not auto-receive them.
 *
 * When a new implemented capability is added to the catalogs below, re-run the
 * grant script so developer/QA profiles receive it.
 *
 * Do not invent capability strings here — only import existing constants.
 */

import { COMMAND_CENTRE_CAPABILITIES } from "../../src/modules/command-centre/types";
import { PLATFORM_FINANCE_CAPABILITIES } from "../../src/modules/platform-finance/types";

/** Default org for local/dev QA grants (PayChex). */
export const PLATFORM_DEVELOPER_ACCESS_ORG_SLUG = "paychex";

/**
 * Role slugs that receive the developer/QA bundle when no --email /
 * --profile-id is supplied. Same eligibility model as the prior Finance
 * grant script.
 */
export const PLATFORM_DEVELOPER_ACCESS_ROLE_SLUGS = [
  "organisation_owner",
  "platform_super_admin",
] as const;

/**
 * All registered Platform Finance capabilities required to develop and QA
 * implemented Finance surfaces (including Vendor Bills end-to-end).
 *
 * CEO testing uses request_approve (no vendor_bill.approve exists).
 * payable_create remains granted so capability checks pass where present;
 * direct payable minting is still blocked by SQL / API refusal.
 */
export const PLATFORM_DEVELOPER_FINANCE_CAPABILITIES = [
  PLATFORM_FINANCE_CAPABILITIES.view,
  PLATFORM_FINANCE_CAPABILITIES.manage_setup,
  PLATFORM_FINANCE_CAPABILITIES.manage_periods,
  PLATFORM_FINANCE_CAPABILITIES.manage_coa,
  PLATFORM_FINANCE_CAPABILITIES.create_transaction,
  PLATFORM_FINANCE_CAPABILITIES.post,
  PLATFORM_FINANCE_CAPABILITIES.request_create,
  PLATFORM_FINANCE_CAPABILITIES.request_view_own,
  PLATFORM_FINANCE_CAPABILITIES.request_review,
  PLATFORM_FINANCE_CAPABILITIES.request_approve,
  PLATFORM_FINANCE_CAPABILITIES.payable_view,
  PLATFORM_FINANCE_CAPABILITIES.payable_create,
  PLATFORM_FINANCE_CAPABILITIES.payable_review,
  PLATFORM_FINANCE_CAPABILITIES.payable_approve,
  PLATFORM_FINANCE_CAPABILITIES.vendor_bill_view,
  PLATFORM_FINANCE_CAPABILITIES.vendor_bill_create,
  PLATFORM_FINANCE_CAPABILITIES.vendor_bill_review,
] as const;

/** Command Centre capabilities (platform_capability_grants). */
export const PLATFORM_DEVELOPER_COMMAND_CENTRE_CAPABILITIES = [
  COMMAND_CENTRE_CAPABILITIES.view,
  COMMAND_CENTRE_CAPABILITIES.decide,
] as const;

/**
 * Human-readable map for audits / script output.
 * FM/ECC: no DB capability grants — session role + organisation_modules.
 */
export const PLATFORM_DEVELOPER_ACCESS_NOTES = {
  facilityManagement:
    "FM uses in-memory ACCESS_CAPABILITIES from operating role / Super Admin override — no finance/platform capability table.",
  eccOperations:
    "ECC uses organisation_modules enablement only — no ECC capability grant table.",
  constructionProjects:
    "Not implemented — no capabilities to grant.",
  separationOfDuties:
    "SoD still applies (inputter cannot review/approve own Vendor Bill). Use multiple bills or actors when testing the full path alone.",
} as const;
