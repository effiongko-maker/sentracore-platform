/**
 * V1 user visibility model verification (pure / static).
 *
 * Separates VIEW surfaces from mutation capabilities.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-access-visibility.mts
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accessCan,
  applyPlatformSuperAdmin,
  canSeeHref,
  canSeeSurface,
  capabilitiesForRole,
  resolveAccessVisibility,
  resolveOperatingAccessFromSheetUser,
  type OperatingAccess,
  type VisibilitySurface,
} from "../src/lib/access";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function sheetAccess(
  role: string,
  email = "user@example.com"
): OperatingAccess {
  return resolveOperatingAccessFromSheetUser(email, "User", {
    id: "USR-1",
    name: "User",
    email,
    role,
    status: "active",
    facility: "NCC Annex",
  });
}

function expectSurfaces(
  label: string,
  access: OperatingAccess,
  required: VisibilitySurface[],
  forbidden: VisibilitySurface[]
) {
  const vis = resolveAccessVisibility(access);
  for (const s of required) {
    assert(canSeeSurface(vis, s), `${label} should see ${s}`);
  }
  for (const s of forbidden) {
    assert(!canSeeSurface(vis, s), `${label} should NOT see ${s}`);
  }
}

function main() {
  // —— Super Admin: full visibility; distinct from FM ——
  const nccInactive = sheetAccess("NCC / Client", "sa@example.com");
  const sa = applyPlatformSuperAdmin(
    { ...nccInactive, inactive: true, capabilities: [] },
    true
  );
  assert(sa.hasAdminOverride, "SA override");
  assert(sa.role === "ncc_client", "SA must not become Facility Manager");
  expectSurfaces(
    "Super Admin",
    sa,
    ["home", "operations", "finance", "users", "requests", "approvals"],
    []
  );
  assert(accessCan(sa, "finance.pay"), "SA can mutate via override");
  assert(!accessCan(sa, "fm.authorize_protected"), "SA ≠ FM protected");

  // —— Facility Manager ——
  const fm = sheetAccess("Facility Manager");
  expectSurfaces(
    "FM",
    fm,
    ["home", "operations", "finance", "users", "approvals", "requests"],
    []
  );
  assert(accessCan(fm, "fm.authorize_protected"), "FM protected authority");
  assert(accessCan(fm, "finance.authorize"), "FM authorize");

  // —— FM Staff ——
  const staff = sheetAccess("FM Staff");
  expectSurfaces(
    "FM Staff",
    staff,
    ["home", "operations", "finance", "users", "requests", "approvals"],
    []
  );
  assert(accessCan(staff, "ops.create"), "staff ops create");
  assert(accessCan(staff, "finance.create"), "staff finance create");
  assert(!accessCan(staff, "finance.authorize"), "staff no authorize");
  assert(!accessCan(staff, "users.manage"), "staff no manage users");

  // —— Liaison Officer ——
  const liaison = sheetAccess("Liaison Officer");
  const liaisonVis = resolveAccessVisibility(liaison);
  expectSurfaces(
    "Liaison",
    liaison,
    ["home", "operations", "finance", "requests"],
    []
  );
  assert(canSeeHref(liaisonVis, "/occupant-requests"), "liaison requests href");
  assert(canSeeHref(liaisonVis, "/finance"), "liaison finance href");
  assert(!accessCan(liaison, "ops.create"), "liaison no ops create");
  assert(!accessCan(liaison, "finance.create"), "liaison no finance create");
  assert(!accessCan(liaison, "users.manage"), "liaison no user manage");

  // —— Finance ——
  const finance = sheetAccess("Finance");
  expectSurfaces("Finance", finance, ["home", "finance", "operations"], []);
  assert(accessCan(finance, "finance.authorize"), "finance authorize");
  assert(accessCan(finance, "finance.pay"), "finance pay");
  assert(!accessCan(finance, "ops.create"), "finance no ops create");

  // —— NCC / Client: requests isolation ——
  const ncc = sheetAccess("NCC / Client");
  const nccVis = resolveAccessVisibility(ncc);
  expectSurfaces(
    "NCC",
    ncc,
    ["requests"],
    ["finance", "operations", "users", "approvals", "organise", "home"]
  );
  assert(canSeeHref(nccVis, "/occupant-requests"), "NCC requests href");
  assert(!canSeeHref(nccVis, "/finance"), "NCC no finance href");
  assert(!canSeeHref(nccVis, "/work-orders"), "NCC no WO href");
  assert(!accessCan(ncc, "finance.view"), "NCC no finance.view");
  assert(!accessCan(ncc, "ops.view"), "NCC no ops.view (API isolation)");

  // —— Executive / Boss: broad VIEW, no mutations ——
  const boss = sheetAccess("Executive Oversight", "boss@example.com");
  assert(boss.role === "executive", "boss role");
  const bossVis = resolveAccessVisibility(boss);
  assert(bossVis.isExecutiveOversight, "executive oversight flag");
  expectSurfaces(
    "Boss",
    boss,
    ["home", "operations", "approvals", "finance", "requests", "organise", "reports"],
    ["users", "intelligence"]
  );
  assert(canSeeHref(bossVis, "/finance"), "boss finance href");
  assert(canSeeHref(bossVis, "/work-orders"), "boss WO href");
  assert(canSeeHref(bossVis, "/approvals"), "boss approvals href");
  assert(!canSeeHref(bossVis, "/users"), "boss no users href");

  // Visibility ≠ mutation
  assert(accessCan(boss, "ops.view"), "boss ops.view");
  assert(accessCan(boss, "finance.view"), "boss finance.view");
  assert(!accessCan(boss, "ops.create"), "boss no ops.create");
  assert(!accessCan(boss, "ops.edit"), "boss no ops.edit");
  assert(!accessCan(boss, "finance.create"), "boss no finance.create");
  assert(!accessCan(boss, "finance.submit"), "boss no finance.submit");
  assert(!accessCan(boss, "finance.authorize"), "boss no finance.authorize");
  assert(!accessCan(boss, "finance.pay"), "boss no finance.pay");
  assert(!accessCan(boss, "users.manage"), "boss no users.manage");
  assert(!accessCan(boss, "approvals.manage"), "boss no approvals.manage");
  assert(!accessCan(boss, "fm.authorize_protected"), "boss no FM protected");
  assert(!bossVis.canMutateOperations, "boss canMutateOperations false");
  assert(!bossVis.canMutateFinance, "boss canMutateFinance false");
  assert(!bossVis.canAuthorizeFinance, "boss canAuthorizeFinance false");

  const bossAlias = sheetAccess("Boss");
  assert(bossAlias.role === "executive", "Boss alias → executive");

  // —— Wiring: nav + finance UI gates ——
  const layers = readSrc("src/lib/platform/layers.ts");
  assert(layers.includes("AccessVisibility"), "layers visibility filter");
  assert(layers.includes("canSeeHref"), "layers href filter");

  const nav = readSrc("src/lib/navigation.ts");
  assert(nav.includes("AccessVisibility"), "nav visibility filter");

  const compass = readSrc("src/components/platform/OrganisationalCompass.tsx");
  assert(compass.includes("resolveAccessVisibility"), "compass visibility");

  const sidebar = readSrc("src/components/navigation/Sidebar.tsx");
  assert(sidebar.includes("resolveAccessVisibility"), "sidebar visibility");

  const palette = readSrc("src/components/platform/CommandPalette.tsx");
  assert(palette.includes("requireCapability"), "palette mutation gate");
  assert(palette.includes("ops.create"), "palette ops.create gate");

  const command = readSrc(
    "src/modules/workspace/components/CommandSurface.tsx"
  );
  assert(command.includes("resolveAccessVisibility"), "home visibility");
  assert(command.includes('can("ops.create")'), "home log-issue gate");

  const finHeader = readSrc(
    "src/modules/finance/components/FinanceHeader.tsx"
  );
  assert(finHeader.includes("canMutateFinance"), "finance header mutate gate");

  const finPage = readSrc("src/modules/finance/components/FinancePage.tsx");
  assert(finPage.includes('can("finance.create")'), "finance page create gate");

  const costDetail = readSrc(
    "src/modules/finance/components/CostDetailPage.tsx"
  );
  assert(
    costDetail.includes("canMutateFinance"),
    "cost detail mutate gate"
  );

  const financeProxy = readSrc(
    "src/lib/access/postFinanceProxyWithProtection.ts"
  );
  assert(
    financeProxy.includes('readCapability ?? "finance.view"'),
    "finance reads require finance.view"
  );

  const capsSrc = readSrc("src/lib/access/capabilities.ts");
  assert(capsSrc.includes("executive:"), "executive capability matrix");

  const execCaps = capabilitiesForRole("executive");
  assert(
    !execCaps.includes("fm.authorize_protected"),
    "executive caps omit FM protected"
  );
  assert(!execCaps.includes("finance.create"), "executive caps omit create");

  console.log("PASS verify-access-visibility");
  console.log("  Super Admin / FM / Staff / Liaison / Finance / NCC / Boss");
  console.log("  visibility ≠ mutation; SA ≠ FM; protected authority unchanged");
}

main();
