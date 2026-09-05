/**
 * Users & Access V1 foundation verification (pure / static).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-users-access.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  ACCESS_CAPABILITIES,
  LEGACY_UNASSIGNED_CAPABILITIES,
  PLATFORM_SUPER_ADMIN_SLUG,
  SUPER_ADMIN_OVERRIDE_CAPABILITIES,
  V1_OPERATING_ROLES,
  V1_OPERATING_ROLE_LABELS,
  accessCan,
  applyPlatformSuperAdmin,
  capabilitiesForRole,
  findSheetUserByEmail,
  isInactiveUserStatus,
  isPlatformSuperAdminFromSlugs,
  parseV1OperatingRole,
  resolveOperatingAccessFromSheetUser,
  resolveProtectedActionAuthority,
  type AccessCapability,
  type V1OperatingRole,
} from "../src/lib/access";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function expectCaps(
  role: V1OperatingRole,
  required: AccessCapability[],
  forbidden: AccessCapability[]
) {
  const caps = capabilitiesForRole(role);
  for (const cap of required) {
    assert(caps.includes(cap), `${role} should have ${cap}`);
  }
  for (const cap of forbidden) {
    assert(!caps.includes(cap), `${role} should NOT have ${cap}`);
  }
}

function main() {
  assert(V1_OPERATING_ROLES.length === 6, "exactly six V1 roles (incl. executive)");
  assert(
    parseV1OperatingRole("Facility Manager") === "facility_manager",
    "parse FM"
  );
  assert(parseV1OperatingRole("FM Staff") === "fm_staff", "parse FM Staff");
  assert(
    parseV1OperatingRole("Liaison Officer") === "liaison_officer",
    "parse Liaison"
  );
  assert(parseV1OperatingRole("Finance") === "finance", "parse Finance");
  assert(parseV1OperatingRole("NCC / Client") === "ncc_client", "parse NCC");
  assert(parseV1OperatingRole("NCC") === "ncc_client", "parse NCC alias");
  assert(
    parseV1OperatingRole("Executive Oversight") === "executive",
    "parse Executive"
  );
  assert(parseV1OperatingRole("Boss") === "executive", "parse Boss alias");
  assert(parseV1OperatingRole("Technician") == null, "legacy unmapped");
  assert(
    V1_OPERATING_ROLE_LABELS.facility_manager === "Facility Manager",
    "label FM"
  );
  assert(
    V1_OPERATING_ROLE_LABELS.executive === "Executive Oversight",
    "label Executive"
  );

  expectCaps(
    "facility_manager",
    [
      "users.manage",
      "ops.create",
      "finance.authorize",
      "finance.pay",
      "fm.authorize_protected",
    ],
    ["platform.admin_override"]
  );
  expectCaps(
    "fm_staff",
    ["users.view", "ops.create", "finance.create", "finance.submit"],
    ["users.manage", "finance.authorize", "finance.pay"]
  );
  expectCaps(
    "liaison_officer",
    ["users.view", "ops.view", "requests.view", "finance.view"],
    ["users.manage", "ops.create", "finance.authorize", "finance.create"]
  );
  expectCaps(
    "finance",
    [
      "users.view",
      "finance.view",
      "finance.create",
      "finance.authorize",
      "finance.pay",
    ],
    ["users.manage", "ops.create"]
  );
  expectCaps(
    "ncc_client",
    ["requests.view"],
    [
      "users.manage",
      "users.view",
      "finance.view",
      "finance.create",
      "ops.create",
    ]
  );
  expectCaps(
    "executive",
    ["ops.view", "finance.view", "requests.view"],
    [
      "ops.create",
      "ops.edit",
      "finance.create",
      "finance.submit",
      "finance.authorize",
      "finance.pay",
      "users.manage",
      "users.view",
      "approvals.manage",
      "fm.authorize_protected",
      "platform.admin_override",
    ]
  );

  const inactive = capabilitiesForRole("facility_manager", { inactive: true });
  assert(inactive.length === 0, "inactive has no capabilities");
  assert(isInactiveUserStatus("inactive"), "inactive status");
  assert(isInactiveUserStatus("suspended"), "suspended status");
  assert(!isInactiveUserStatus("active"), "active status");

  const legacy = capabilitiesForRole(null, { unassigned: true });
  assert(
    legacy.length === LEGACY_UNASSIGNED_CAPABILITIES.length,
    "legacy unassigned caps"
  );
  assert(
    !legacy.includes("platform.admin_override"),
    "legacy must not get platform override"
  );
  assert(
    legacy.includes("fm.authorize_protected"),
    "legacy preserves FM protected-action foundation"
  );

  const sheetMatch = resolveOperatingAccessFromSheetUser(
    "fm@example.com",
    "Session Name",
    {
      id: "USR-1",
      name: "Ada",
      email: "fm@example.com",
      role: "Facility Manager",
      status: "active",
      facility: "NCC Annex",
    }
  );
  assert(sheetMatch.role === "facility_manager", "sheet role resolve");
  assert(sheetMatch.source === "sheet", "sheet source");
  assert(sheetMatch.facility === "NCC Annex", "facility assignment");
  assert(accessCan(sheetMatch, "users.manage"), "FM can manage users");
  assert(sheetMatch.authorityKind === "facility_manager", "FM authority kind");
  assert(!sheetMatch.isSuperAdmin, "FM is not Super Admin");
  assert(!sheetMatch.hasAdminOverride, "FM has no platform override");
  assert(
    resolveProtectedActionAuthority(sheetMatch)?.mode === "facility_manager",
    "FM protected authority mode"
  );

  const inactiveAccess = resolveOperatingAccessFromSheetUser(
    "x@example.com",
    "X",
    {
      id: "USR-2",
      name: "X",
      email: "x@example.com",
      role: "FM Staff",
      status: "inactive",
      facility: "NCC Annex",
    }
  );
  assert(inactiveAccess.inactive, "inactive flag");
  assert(inactiveAccess.capabilities.length === 0, "inactive caps empty");
  assert(!accessCan(inactiveAccess, "ops.view"), "inactive cannot ops.view");

  const unassigned = resolveOperatingAccessFromSheetUser(
    "legacy@example.com",
    "Legacy",
    null
  );
  assert(unassigned.unassigned, "unassigned flag");
  assert(unassigned.role == null, "unassigned role null");
  assert(accessCan(unassigned, "users.manage"), "legacy preserves manage");

  const serverSrc = readSrc("src/lib/access/server.ts");
  assert(
    serverSrc.includes("lookupFailed"),
    "sheet lookup failure is detected"
  );
  assert(
    serverSrc.includes("denying operating capabilities") ||
      serverSrc.includes("Unavailable"),
    "sheet lookup failure fails closed (not legacy elevate)"
  );
  assert(
    !serverSrc.includes("treating as unassigned"),
    "must not elevate to unassigned on lookup failure"
  );
  assert(
    serverSrc.includes("loadSheetUserForAccessByEmail"),
    "People access resolves by email search (not truncated page)"
  );
  assert(
    serverSrc.includes("search: target") ||
      serverSrc.includes("search:target") ||
      /search:\s*target/.test(serverSrc),
    "email used as People search term"
  );

  const legacyRole = resolveOperatingAccessFromSheetUser(
    "tech@example.com",
    "Tech",
    {
      id: "USR-3",
      name: "Tech",
      email: "tech@example.com",
      role: "Technician",
      status: "active",
      facility: "NCC Annex",
    }
  );
  assert(legacyRole.unassigned, "unrecognised sheet role → unassigned caps");
  assert(accessCan(legacyRole, "ops.create"), "legacy sheet role keeps ops");

  // Super Admin is platform-level — not a People-register / FM role.
  assert(
    parseV1OperatingRole("System Administrator") == null,
    "Super Admin label is not a V1 operating role"
  );
  assert(
    parseV1OperatingRole("Super Admin") == null,
    "Super Admin alias is not a V1 operating role"
  );
  assert(
    isPlatformSuperAdminFromSlugs([PLATFORM_SUPER_ADMIN_SLUG]),
    "detect platform_super_admin slug"
  );
  assert(
    !isPlatformSuperAdminFromSlugs(["facility_manager", "organisation_owner"]),
    "FM / org roles are not Super Admin"
  );

  const nccBase = resolveOperatingAccessFromSheetUser(
    "admin@example.com",
    "Admin",
    {
      id: "USR-SA",
      name: "Admin",
      email: "admin@example.com",
      role: "NCC / Client",
      status: "inactive",
      facility: "NCC Annex",
    }
  );
  assert(nccBase.role === "ncc_client", "sheet operating role stays NCC");
  assert(nccBase.inactive, "sheet inactive before override");
  assert(!accessCan(nccBase, "users.manage"), "NCC cannot manage users");

  const superAdmin = applyPlatformSuperAdmin(nccBase, true);
  assert(superAdmin.isSuperAdmin, "Super Admin flag");
  assert(superAdmin.hasAdminOverride, "admin override flag");
  assert(superAdmin.platformRole === "system_administrator", "platform role");
  assert(
    superAdmin.platformRoleLabel === "System Administrator",
    "platform role label"
  );
  assert(
    superAdmin.role === "ncc_client",
    "Super Admin must NOT become Facility Manager"
  );
  assert(superAdmin.authorityKind === "platform_override", "override authority");
  assert(!superAdmin.inactive, "override clears sheet inactive lockout");
  assert(accessCan(superAdmin, "users.manage"), "override can manage users");
  assert(accessCan(superAdmin, "finance.authorize"), "override finance");
  assert(
    accessCan(superAdmin, "platform.admin_override"),
    "override capability present"
  );
  assert(
    !superAdmin.capabilities.includes("fm.authorize_protected"),
    "override must not claim FM protected-action capability"
  );
  assert(
    !accessCan(superAdmin, "fm.authorize_protected"),
    "platform override ≠ FM authorize_protected"
  );
  const protectedAuth = resolveProtectedActionAuthority(superAdmin);
  assert(protectedAuth?.mode === "platform_override", "protected mode override");
  assert(
    protectedAuth?.label === "System Administrator override",
    "distinguishable override label"
  );

  const fmWithOverride = applyPlatformSuperAdmin(sheetMatch, true);
  assert(
    fmWithOverride.role === "facility_manager",
    "sheet FM identity preserved under Super Admin"
  );
  assert(
    fmWithOverride.authorityKind === "platform_override",
    "when Super Admin, authority kind is override not FM"
  );
  assert(
    resolveProtectedActionAuthority(fmWithOverride)?.mode ===
      "platform_override",
    "Super Admin prefers platform_override over FM auth"
  );
  assert(
    SUPER_ADMIN_OVERRIDE_CAPABILITIES.includes("platform.admin_override"),
    "override capability list"
  );

  const found = findSheetUserByEmail(
    [
      {
        id: "1",
        name: "A",
        email: "Ada@Example.com",
        role: "Finance",
        status: "active",
        facility: "NCC Annex",
      },
    ],
    "ada@example.com"
  );
  assert(found?.id === "1", "email match case-insensitive");

  const usersRoute = readSrc("src/app/api/users/route.ts");
  assert(usersRoute.includes("users.manage"), "users API manage gate");
  assert(usersRoute.includes("users.view"), "users API view gate");

  const authRoute = readSrc(
    "src/app/api/reimbursement-authorizations/route.ts"
  );
  assert(authRoute.includes("finance.authorize"), "auth API gate");

  const payRoute = readSrc("src/app/api/reimbursement-payments/route.ts");
  assert(payRoute.includes("finance.pay"), "pay API gate");

  const costRoute = readSrc("src/app/api/cost-records/route.ts");
  assert(costRoute.includes("finance.create"), "cost records gate");

  const submissionRoute = readSrc("src/app/api/cost-submissions/route.ts");
  assert(submissionRoute.includes("finance.submit"), "submission submit gate");
  assert(submissionRoute.includes("finance.create"), "submission create gate");
  assert(submissionRoute.includes("finance.view"), "submission read gate");

  const financeProxy = readSrc(
    "src/lib/access/postFinanceProxyWithProtection.ts"
  );
  assert(financeProxy.includes("finance.view"), "finance proxy read gate");
  assert(financeProxy.includes("readCapability"), "finance proxy read option");

  const accessMe = readSrc("src/app/api/access/me/route.ts");
  assert(accessMe.includes("getOperatingAccess"), "access me endpoint");

  const usersPage = readSrc("src/modules/users/components/UsersPage.tsx");
  assert(usersPage.includes('can("users.manage")'), "UsersPage manage gate");
  assert(usersPage.includes('can("users.view")'), "UsersPage view gate");

  const form = readSrc("src/modules/users/components/UserFormModal.tsx");
  assert(form.includes("V1_OPERATING_ROLE_OPTIONS"), "V1 role select");
  assert(form.includes("V1_DEPLOYED_FACILITY_NAME"), "NCC Annex default");
  assert(
    !form.includes("system_administrator"),
    "People form must not offer Super Admin as facility role"
  );

  const detail = readSrc(
    "src/modules/finance/components/SubmissionDetailPage.tsx"
  );
  assert(detail.includes('can("finance.authorize")'), "UI authorize gate");
  assert(detail.includes('can("finance.pay")'), "UI pay gate");

  const constants = readSrc("src/modules/users/constants.ts");
  assert(constants.includes("V1_OPERATING_ROLE_LABELS"), "V1 labels wired");
  assert(constants.includes("USER_MANAGE_STATUSES"), "active/inactive manage statuses");
  assert(!constants.includes('"Technician"'), "legacy Technician removed");

  const platformRoles = readSrc("src/lib/access/platformRoles.ts");
  assert(platformRoles.includes("platform_super_admin"), "uses existing slug");
  assert(platformRoles.includes("System Administrator"), "display label");

  const capsSrc = readSrc("src/lib/access/capabilities.ts");
  assert(capsSrc.includes("platform.admin_override"), "override capability");
  assert(capsSrc.includes("fm.authorize_protected"), "FM protected capability");

  console.log("PASS verify-users-access");
  console.log("  operating roles:", V1_OPERATING_ROLES.join(", "));
  console.log("  capabilities:", ACCESS_CAPABILITIES.length);
  console.log("  platform Super Admin: system_administrator + platform.admin_override");
}

main();
