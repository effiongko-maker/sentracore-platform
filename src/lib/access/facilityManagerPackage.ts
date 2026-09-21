/**
 * The canonical Facility Manager OPERATING package.
 *
 * Product rule: an active Facility Manager has complete operating visibility across the Facility Management
 * workspace, and the ordinary operating authority to work in it. Data must not silently disappear from a Facility
 * Manager because a normal view capability was omitted from what they were granted.
 *
 * Authority remains EXPLICIT: the operating role grants nothing at runtime. This package is the single definition of
 * the explicit, audited grants (platform_capability_grants, via platform_iam_grant_platform_capability) that are
 * applied when an active Facility Manager assignment is made and by reconcileFacilityManagerPackages.
 *
 * It is deliberately NOT protected authority. Separation of duties is preserved: none of FACILITY_MANAGER_EXCLUDED
 * is ever implied by this package.
 */
import type { AccessCapability } from "./capabilities";

export const FACILITY_MANAGER_OPERATING_PACKAGE = [
  // Operational registers: incidents (legacy), Issues, Work, Work Instructions, assets, facilities, logs, approvals
  // queue, reports and operational workload — and ordinary operating work in them.
  "ops.view",
  "ops.create",
  "ops.edit",
  "ops.submit",
  // The Request queue: Request-derived Issues, the Requests surface and request notifications.
  "requests.view",
  // Read-only FM costs and claims (cost records, claims, authorisations and payments as RECORDS). Not Platform Finance
  // (which has its own capability family) and not authority to authorise or pay anything.
  "finance.view",
  // The FM people directory (read).
  "users.view",
] as const satisfies readonly AccessCapability[];

export type FacilityManagerPackageCapability = (typeof FACILITY_MANAGER_OPERATING_PACKAGE)[number];

/**
 * Capabilities the package must NEVER carry. Visibility is not authorisation: these stay separately, explicitly
 * granted (and, for protected actions, step-up verified).
 */
export const FACILITY_MANAGER_EXCLUDED: ReadonlyArray<{ capability: AccessCapability; reason: string }> = [
  { capability: "fm.authorize_protected", reason: "Protected-action authority (password step-up) is a separate, deliberate grant." },
  { capability: "finance.authorize", reason: "Reimbursement authorisation is protected authority, separated from operating visibility." },
  { capability: "finance.pay", reason: "Recording reimbursement payments is protected authority." },
  { capability: "finance.create", reason: "Recording FM costs / drafting claims is a mutation, not visibility." },
  { capability: "finance.submit", reason: "Submitting claims is a mutation, not visibility." },
  { capability: "approvals.manage", reason: "Creating and progressing approval packages is a mutation, not visibility." },
  { capability: "users.manage", reason: "Assigning people and changing operating roles is administration, not operating visibility." },
  { capability: "platform.admin_override", reason: "System Administrator override is derived from Super Admin, never from an operating role." },
];

/** Package capabilities a profile does not yet hold (order preserved). */
export function facilityManagerPackageGaps(held: readonly string[]): FacilityManagerPackageCapability[] {
  const have = new Set(held);
  return FACILITY_MANAGER_OPERATING_PACKAGE.filter((capability) => !have.has(capability));
}
