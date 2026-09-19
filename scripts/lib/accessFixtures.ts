/**
 * TEST FIXTURES for access verifiers.
 *
 * Runtime authority is EXPLICIT capability grants (platform_capability_grants).
 * Operating role / job title / facility assignment are descriptive context and
 * confer no capability. These helpers let verifiers model:
 *   - a person's operating CONTEXT (role, facility, status) — with NO capabilities, and
 *   - a representative bundle of explicit grants an administrator might give.
 * Nothing here is imported by application code.
 */
import type { User, UserStatus } from "../../src/modules/users/types";
import { resolveOperatingAccessFromGrants, isInactiveUserStatus, type OperatingAccess } from "../../src/lib/access/resolveAccess";
import { parseV1OperatingRole, v1OperatingRoleLabel, type V1OperatingRole } from "../../src/lib/access/roles";
import type { AccessCapability } from "../../src/lib/access/capabilities";

const EXPLICIT_GRANT_BUNDLES: Record<V1OperatingRole, readonly AccessCapability[]> = {
  facility_manager: [
    "users.view",
    "users.manage",
    "ops.view",
    "ops.create",
    "ops.edit",
    "ops.submit",
    "finance.view",
    "finance.create",
    "finance.submit",
    "finance.authorize",
    "finance.pay",
    "approvals.manage",
    "requests.view",
    "fm.authorize_protected",
  ],
  fm_staff: [
    "users.view",
    "ops.view",
    "ops.create",
    "ops.edit",
    "ops.submit",
    "finance.view",
    "finance.create",
    "finance.submit",
    "approvals.manage",
    "requests.view",
  ],
  liaison_officer: [
    "users.view",
    "ops.view",
    "finance.view",
    "requests.view",
  ],
  finance: [
    "users.view",
    "ops.view",
    "finance.view",
    "finance.create",
    "finance.submit",
    "finance.authorize",
    "finance.pay",
    "requests.view",
  ],
  ncc_client: [
    // Requests portal only — no ops.view so WO/MNT/INC/approvals APIs stay closed
    "requests.view",
  ],
  /**
   * Boss / executive — VIEW and DRILL-DOWN only.
   * No create/edit/submit/authorize/pay/manage-users/protected FM auth.
   */
  executive: [
    "ops.view",
    "finance.view",
    "requests.view",
  ],
};


/** A representative explicit-grant bundle. Inactive / unassigned people hold none. */
export function explicitGrantBundle(
  role: V1OperatingRole | null,
  options?: { inactive?: boolean; unassigned?: boolean }
): AccessCapability[] {
  if (options?.inactive) return [];
  if (options?.unassigned || role == null) return [];
  return [...EXPLICIT_GRANT_BUNDLES[role]];
}

type ContextRecord = Pick<User, "id" | "role" | "status" | "facility" | "name" | "email">;

/**
 * Operating CONTEXT only (descriptive role / facility / status). Grants NO capability —
 * pass explicit capabilities separately, exactly as runtime does.
 */
export function contextAccess(email: string, name: string, record: ContextRecord | null): OperatingAccess {
  if (!record) {
    return resolveOperatingAccessFromGrants({ email, name, role: null, unassigned: true, inactive: false, capabilities: [] });
  }
  const role = parseV1OperatingRole(record.role);
  return resolveOperatingAccessFromGrants({
    email: record.email || email,
    name: record.name || name,
    role,
    roleLabel: role ? v1OperatingRoleLabel(role) : record.role || "Unassigned",
    status: (record.status || "") as UserStatus | "",
    facility: record.facility || "",
    inactive: isInactiveUserStatus(record.status),
    unassigned: role == null,
    capabilities: [],
    profileId: record.id,
  });
}
