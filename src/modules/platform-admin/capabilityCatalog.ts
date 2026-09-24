import {
  PLATFORM_ADMINISTRABLE_CAPABILITIES,
  type PlatformAdministrableCapability,
} from "./types";

/**
 * How the administrable capabilities are presented in the Admin Console.
 * Grouping and labels follow how each capability is actually enforced in the
 * platform (route gates / workspace gates) — this catalog adds NO capability
 * and NO authority. Explicit grants are the only authority.
 */

export type CapabilityDomainId =
  | "fm_operations"
  | "fm_people"
  | "fm_requests_approvals"
  | "fm_costs"
  | "fm_protected"
  | "ecc"
  | "command_centre"
  | "private_office"
  | "platform_finance_admin";

export type CapabilityDomain = {
  id: CapabilityDomainId;
  label: string;
  summary: string;
  /** Module whose organisation availability this domain depends on (when the gate reads it). */
  moduleSlug: "facility_management" | "ecc_operations" | null;
  capabilities: Array<{
    key: PlatformAdministrableCapability;
    label: string;
    detail: string;
  }>;
};

export const CAPABILITY_DOMAINS: readonly CapabilityDomain[] = [
  {
    id: "fm_operations",
    label: "Facility Management · Operations",
    summary: "Operational registers: incidents, work, work instructions, assets, facilities.",
    moduleSlug: "facility_management",
    capabilities: [
      { key: "ops.view", label: "View operational records", detail: "Read registers and operational pictures." },
      { key: "ops.create", label: "Create operational records", detail: "Log incidents, work, instructions and assets." },
      { key: "ops.edit", label: "Edit operational records", detail: "Update or deactivate existing records." },
      { key: "ops.submit", label: "Submit operational work", detail: "Submit work through its workflow." },
    ],
  },
  {
    id: "fm_requests_approvals",
    label: "Facility Management · Requests and approvals",
    summary: "Client requests and approval packages.",
    moduleSlug: "facility_management",
    capabilities: [
      { key: "requests.view", label: "View requests", detail: "See the requests queue." },
      { key: "approvals.manage", label: "Manage approvals", detail: "Create and progress approval packages." },
    ],
  },
  {
    id: "fm_costs",
    label: "Facility Management · Costs and claims",
    summary: "FM operational costs and reimbursement claims (the finance.* capabilities). NOT Platform Finance — the separate accounting domain (platform_finance.*), whose access is administered in the person's Platform Finance access panel, never from this domain.",
    moduleSlug: "facility_management",
    capabilities: [
      { key: "finance.view", label: "View FM costs and claims", detail: "Read FM cost records, claims, authorisations and payments as records. Read-only; confers no authority to authorise or pay." },
      { key: "finance.create", label: "Record FM costs and draft claims", detail: "Create and edit FM cost records and draft claims." },
      { key: "finance.submit", label: "Submit FM claims", detail: "Move an FM claim to submitted." },
      { key: "finance.authorize", label: "Authorise FM reimbursement", detail: "Record an FM reimbursement authorisation. Protected authority — separate from viewing." },
      { key: "finance.pay", label: "Record FM reimbursement payments", detail: "Record amounts received against an authorised FM claim. Protected authority — separate from viewing." },
    ],
  },
  {
    id: "fm_people",
    label: "Facility Management · People",
    summary: "The operating directory of facility assignments.",
    moduleSlug: "facility_management",
    capabilities: [
      { key: "users.view", label: "View the people directory", detail: "See people, facility assignments and operating roles." },
      { key: "users.manage", label: "Manage facility assignments", detail: "Assign people to facilities and change operating roles." },
    ],
  },
  {
    id: "fm_protected",
    label: "Facility Management · Protected actions",
    summary: "Authority to approve sensitive corrections with step-up verification.",
    moduleSlug: "facility_management",
    capabilities: [
      { key: "fm.authorize_protected", label: "Authorise protected actions", detail: "Facility-level authority for protected actions (password step-up). Needs the action's own base capability as well." },
    ],
  },
  {
    id: "ecc",
    label: "ECC Operations",
    summary: "The ECC Operations workspace. Each write needs its own grant in addition to view.",
    moduleSlug: "ecc_operations",
    capabilities: [
      { key: "platform.ecc_operations.view", label: "Enter ECC Operations", detail: "Open the workspace and read Overview, Intelligence, Reporting, Daily Ops, Issues, Requests and People." },
      { key: "platform.ecc_operations.create", label: "Record ECC operations", detail: "Submit Daily Operations and raise Issues and Requests." },
      { key: "platform.ecc_operations.edit", label: "Progress ECC issues and requests", detail: "Change status, add follow-up actions and link Issues and Requests." },
      { key: "platform.ecc_operations.manage_people", label: "Manage ECC roster and shifts", detail: "Add roster people, set shifts and assignments, record attendance. Not platform user management." },
      { key: "platform.ecc_operations.manage_finance", label: "Manage ECC finance", detail: "ECC budgets, commitments and transactions. Separate from Platform Finance." },
      { key: "platform.ecc_operations.delete", label: "Delete ECC records", detail: "Permanently delete ECC Issues. Separate from edit." },
    ],
  },
  {
    id: "command_centre",
    label: "Executive Office",
    summary: "Executive orchestration. Domain actions still need their own domain capability.",
    moduleSlug: null,
    capabilities: [
      { key: "platform.command_centre.view", label: "View Executive Office", detail: "Open pulse, exceptions, decisions and assignments." },
      { key: "platform.command_centre.decide", label: "Take Executive Office decisions", detail: "Act on decisions surfaced by Executive Office." },
      { key: "platform.command_centre.commitments.view", label: "View executive commitments", detail: "See the commitments they created or own. Being assigned a commitment does not grant this." },
      { key: "platform.command_centre.commitments.manage", label: "Manage executive commitments", detail: "Create, edit, complete and cancel executive commitments. Separate from taking decisions." },
    ],
  },
  {
    id: "private_office",
    label: "Private Office",
    summary: "Private executive domain. Independent of Executive Office and of administrative authority.",
    moduleSlug: null,
    capabilities: [
      { key: "platform.executive.private_office.access", label: "Enter Private Office", detail: "Private executive workspace. Not implied by Executive Office, Super Admin or any other capability, and granting it does not let the administrator enter." },
    ],
  },
  {
    id: "platform_finance_admin",
    label: "Platform Finance administration",
    summary: "Administer other people's Platform Finance access from the Admin Console.",
    moduleSlug: null,
    capabilities: [
      { key: "platform_finance.access.manage", label: "Administer Platform Finance access", detail: "Assign company access and Finance capabilities to other people. Does not grant entry to Platform Finance or any Finance access." },
    ],
  },
] as const;

const BY_KEY = new Map<string, { domain: CapabilityDomain; label: string; detail: string }>();
for (const domain of CAPABILITY_DOMAINS) {
  for (const cap of domain.capabilities) BY_KEY.set(cap.key, { domain, label: cap.label, detail: cap.detail });
}

export function describeCapability(key: string): { label: string; domainLabel: string | null; known: boolean } {
  const hit = BY_KEY.get(key);
  return hit ? { label: hit.label, domainLabel: hit.domain.label, known: true } : { label: key, domainLabel: null, known: false };
}

/** Every administrable capability appears in exactly one domain. */
export function catalogCoversAllAdministrableCapabilities(): boolean {
  const seen = CAPABILITY_DOMAINS.flatMap((d) => d.capabilities.map((c) => c.key));
  return (
    seen.length === PLATFORM_ADMINISTRABLE_CAPABILITIES.length &&
    new Set(seen).size === seen.length &&
    PLATFORM_ADMINISTRABLE_CAPABILITIES.every((c) => seen.includes(c))
  );
}
