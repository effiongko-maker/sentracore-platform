/**
 * Create Account → Home workspace model. One authoritative registry; Platform Finance is a valid module-bound home;
 * Command Centre / Admin Console / Batcave are not; a home is a boundary, never authority.
 *
 *   NODE_PATH=<dir with empty server-only/> npx tsx --tsconfig tsconfig.json scripts/verify-home-workspaces.mts
 */
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { boundaryAllows, resolveModuleBoundary, homeRouteForBoundary, BOUND_MODULES, MODULE_HOME_ROUTE } from "../src/lib/access/moduleBoundary";
import { LANDING_WORKSPACES, LANDING_WORKSPACE_ROUTE, resolveLandingRoute } from "../src/lib/access/landingWorkspace";
import { LANDING_OPTIONS, MODULE_BOUND_HOME_OPTIONS, WORKSPACE_REGISTRY, workspaceEntry } from "../src/lib/access/workspaceRegistry";
import { PlatformAdminServerService } from "../src/modules/platform-admin/server/PlatformAdminServerService";

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
const out: string[] = [];
const pass = (m: string) => out.push(`PASS ${m}`);
const read = (f: string) => readFileSync(f, "utf8");
const list = (s: string) => [...s.matchAll(/'([a-z_]+)'/g)].map((m) => m[1]!);

async function main() {
  // A. classification
  {
    const by = Object.fromEntries(WORKSPACE_REGISTRY.map((w) => [w.id, w]));
    assert(WORKSPACE_REGISTRY.length === 6 && ["facility_management", "ecc_operations", "platform_finance", "command_centre", "admin_console", "batcave"].every((id) => by[id]), "all six workspaces are classified");
    assert([...BOUND_MODULES].sort().join() === "ecc_operations,facility_management,platform_finance", "module-bound homes are exactly FM, ECC Operations and Platform Finance");
    assert(!BOUND_MODULES.some((m) => ["command_centre", "admin_console", "batcave"].includes(m as string)), "Command Centre, Admin Console and Batcave are never module-bound homes");
    assert([...LANDING_WORKSPACES].sort().join() === "command_centre,ecc_operations,facility_management,platform_finance", "landing preferences: the four business/executive workspaces");
    assert(by.batcave!.kind === "private_nested" && !by.batcave!.moduleBoundHome && !by.batcave!.landingSelectable, "Batcave is private/nested: no home, no landing");
    assert(by.admin_console!.kind === "authority_derived" && !by.admin_console!.moduleBoundHome && !by.admin_console!.landingSelectable, "Admin Console is authority-derived: no home, no landing");
    assert(by.command_centre!.kind === "executive_landing" && !by.command_centre!.moduleBoundHome && by.command_centre!.landingSelectable, "Command Centre is a platform-scope landing only");
    assert(by.platform_finance!.moduleBoundHome && (by.platform_finance!.requiresExplicit as readonly string[]).includes("finance_company_access") && (by.platform_finance!.requiresExplicit as readonly string[]).includes("capability_grants") && !by.platform_finance!.facilityContext, "Platform Finance: home, needs explicit company access + capabilities, no facility context");
    assert(by.facility_management!.facilityContext && !by.ecc_operations!.facilityContext, "only Facility Management carries facility context");
    assert(MODULE_HOME_ROUTE.platform_finance === "/platform-finance" && LANDING_WORKSPACE_ROUTE.platform_finance === "/platform-finance" && MODULE_BOUND_HOME_OPTIONS.length === 3 && LANDING_OPTIONS.length === 4, "routes/options derive from the registry");
    pass("A classification: FM, ECC and Platform Finance are module-bound homes; Command Centre is landing-only; Admin Console and Batcave are neither");
  }

  // B. drift: the DB constraints/RPC mirror the registry (constraint executed in PGlite)
  {
    const mig = read("supabase/migrations/20260921150000_module_bound_platform_finance_home.sql");
    const constraint = mig.match(/add constraint profiles_access_scope_valid check \(([\s\S]*?)\);\n/)![1]!;
    assert([...list(constraint.match(/home_module in \(([^)]*)\)/)![1]!)].sort().join() === [...BOUND_MODULES].sort().join(), "the DB home_module constraint lists exactly the registry's module-bound homes");
    assert([...list(mig.match(/v_home not in \(([^)]*)\)/)![1]!)].sort().join() === [...BOUND_MODULES].sort().join(), "the audited RPC accepts exactly the registry's module-bound homes");
    const landing = read("supabase/migrations/20260920210000_profile_landing_workspace.sql");
    assert([...list(landing.match(/landing_workspace in \(([^)]*)\)/)![1]!)].sort().join() === [...LANDING_WORKSPACES].sort().join(), "the DB landing constraint lists exactly the registry's landing workspaces");
    const db = new PGlite();
    await db.exec("create table profiles (id int, access_scope text not null default 'platform', home_module text);");
    await db.exec(`alter table profiles add constraint profiles_access_scope_valid check (${constraint});`);
    const ok = async (scope: string, home: string | null) => { try { await db.query("insert into profiles (access_scope, home_module) values ($1,$2)", [scope, home]); return true; } catch { return false; } };
    assert((await ok("module", "platform_finance")) && (await ok("module", "facility_management")) && (await ok("module", "ecc_operations")), "the DB accepts a module-bound identity for all three homes");
    for (const bad of ["command_centre", "admin_console", "batcave", "finance"]) assert(!(await ok("module", bad)), `the DB refuses module-bound home '${bad}'`);
    assert(!(await ok("platform", "platform_finance")) && (await ok("platform", null)), "platform scope still must not carry a home module");
    await db.close();
    pass("B drift: DB constraint (executed), audited RPC and landing constraint all equal the registry");
  }

  // C. boundary matrix — a home is a boundary
  {
    const fin = resolveModuleBoundary({ accessScope: "module", homeModule: "platform_finance" });
    assert(fin.valid && homeRouteForBoundary(fin) === "/platform-finance", "a Finance-bound identity lands directly in Platform Finance");
    const t = (b: ReturnType<typeof resolveModuleBoundary>) => (["platform_finance", "facility_management", "ecc_operations", "platform"] as const).map((x) => (boundaryAllows(b, x) ? x : "-")).join(",");
    assert(t(fin) === "platform_finance,-,-,-", `Finance-bound: Platform Finance only — no FM, no ECC, and no platform surface (Command Centre / Admin Console / Batcave) (got ${t(fin)})`);
    assert(t(resolveModuleBoundary({ accessScope: "module", homeModule: "facility_management" })) === "-,facility_management,-,-", "FM-bound cannot reach Platform Finance");
    assert(t(resolveModuleBoundary({ accessScope: "module", homeModule: "ecc_operations" })) === "-,-,ecc_operations,-", "ECC-bound cannot reach Platform Finance");
    assert(t(resolveModuleBoundary({ accessScope: "platform" })) === "platform_finance,facility_management,ecc_operations,platform", "platform scope is unchanged (grants still decide)");
    assert(!resolveModuleBoundary({ accessScope: "module", homeModule: "command_centre" }).valid && !resolveModuleBoundary({ accessScope: "module", homeModule: "batcave" }).valid && !resolveModuleBoundary({ accessScope: "module", homeModule: "admin_console" }).valid, "Command Centre / Batcave / Admin Console as a home fail closed");
    const chromeAll = { facilityManagement: true, eccOperations: true, platformFinance: true, commandCentre: true };
    assert(resolveLandingRoute({ boundary: fin, landingWorkspace: "command_centre", chrome: chromeAll }) === null, "a landing preference can never move a module-bound identity");
    pass("C boundary: Finance-bound lands in Platform Finance and is refused FM, ECC and every platform-wide surface");
  }

  // D. gates use the right targets
  {
    const g = (f: string) => read(f).match(/assertBoundaryAllows\(session, "([a-z_]+)"\)/)?.[1];
    assert(g("src/modules/platform-finance/server/requirePlatformFinanceAccess.ts") === "platform_finance", "Platform Finance API gate admits platform scope or a Finance home only");
    assert(g("src/modules/command-centre/server/requireCommandCentreAccess.ts") === "platform", "Command Centre stays platform-scope only");
    assert(g("src/modules/platform-admin/server/requirePlatformAdmin.ts") === "platform", "Admin Console stays platform-scope (and Super Admin) only");
    assert(g("src/modules/batcave/server/requireBatcaveAccess.ts") === "platform", "Batcave stays platform-scope only");
    assert(g("src/modules/ecc-operations/server/requireEccAccess.ts") === "ecc_operations", "ECC gate unchanged");
    assert(/boundaryAllows\(boundaryForSession\(session\), "facility_management"\)/.test(read("src/lib/access/server.ts")), "FM operating gate unchanged");
    const chrome = read("src/lib/access/workspaceAccessChrome.ts");
    assert(/platformFinance:\s*boundaryAllows\(input\.boundary, "platform_finance"\) &&\s*financeModuleOn &&\s*hasAnyFinanceGrant/.test(chrome), "Platform Finance is enterable only with the module ON and an explicit finance grant — the home alone is not enough");
    assert(/commandCentre:\s*boundaryAllows\(input\.boundary, "platform"\) && hasCommandCentreGrant/.test(chrome), "Command Centre chrome unchanged");
    assert(/assertBoundaryAllows\(session, "platform"\)/.test(read("src/modules/platform-finance/server/requirePlatformFinanceAccess.ts")) === false, "no leftover platform-only assertion in the Platform Finance gate");
    pass("D gates: Platform Finance admits Finance homes; FM, ECC, Command Centre, Admin Console and Batcave gates are unchanged");
  }

  // E. createAccount: home ≠ authority; facility context only where it applies; finance authority never inferred
  {
    const audits: Array<{ action: string; details?: Record<string, unknown> }> = [];
    const grants: string[] = [];
    const created: string[] = [];
    let attempts = 0;
    const authAdmin = {
      listUsers: async () => ({ data: { users: [] }, error: null }),
      createUser: async (a: { email: string }) => { created.push(a.email); return { data: { user: { id: "22222222-2222-4222-8222-222222222222" } }, error: null }; },
    };
    const q: Record<string, unknown> = {};
    for (const m of ["select", "eq", "in", "is", "order", "limit", "insert", "upsert"]) q[m] = () => q;
    q.then = (r: (v: unknown) => void) => r({ data: [], error: null });
    const touched: string[] = [];
    const admin = { auth: { admin: authAdmin }, from: (t: string) => { touched.push(t); return q; } };
    const repo = {
      getOrganisationById: async () => ({ id: "o", slug: "s", status: "active" }),
      attachInvitedProfile: async () => ({ userId: "22222222-2222-4222-8222-222222222222", organisationId: "o", organisationSlug: "s", changed: true }),
      insertAuditEvent: async (e: { action: string; details?: Record<string, unknown> }) => { audits.push(e); },
      getProfile: async () => ({ id: "22222222-2222-4222-8222-222222222222", organisation_id: "o", status: "active", access_scope: "platform" }),
      setAccessScope: async (i: { accessScope: string; homeModule: string | null }) => { attempts += 1; return { changed: true, ...i }; },
      setLandingWorkspace: async () => ({ changed: true }),
      grantPlatformCapability: async (i: { capability: string }) => { grants.push(i.capability); return { changed: true }; },
    };
    const svc = new PlatformAdminServerService(repo as never, admin as never);
    const ctx = { actorProfileId: "actor" } as never;
    const base = { email: "finance.user@example.test", fullName: "Finance User", organisationId: "o", accessScope: "module" };
    const res = await svc.createAccount(ctx, { ...base, homeModule: "platform_finance" });
    assert(res.accessScope === "module" && res.homeModule === "platform_finance", "an account can be provisioned module-bound to Platform Finance");
    assert(grants.length === 0 && res.grantedCapabilities.length === 0 && res.assignment === null, "selecting Platform Finance grants NO capability and creates NO facility assignment");
    assert(!touched.includes("finance_capability_grants") && !touched.includes("finance_company_access"), "selecting Platform Finance never writes finance grants or company access");
    const createdAudit = audits.find((a) => a.action === "user.account_created")!;
    assert(createdAudit.details?.homeModule === "platform_finance" && (createdAudit.details?.capabilities as unknown[]).length === 0, "the audit records the home and that no capabilities were granted");
    for (const home of ["platform_finance", "ecc_operations"]) {
      const n = created.length;
      let err: unknown = null;
      try { await svc.createAccount(ctx, { ...base, email: `x.${home}@example.test`, homeModule: home, facilityAssignment: { facilityId: "f", operationalRole: "facility_manager" } }); } catch (e) { err = e; }
      assert(err !== null && created.length === n, `a facility assignment / FM role is refused (and nothing is created) for a ${home} home`);
    }
    for (const bad of ["command_centre", "batcave", "admin_console"]) {
      const n = created.length;
      let err: unknown = null;
      try { await svc.createAccount(ctx, { ...base, email: `y.${bad}@example.test`, homeModule: bad }); } catch (e) { err = e; }
      assert(err !== null && created.length === n, `'${bad}' is refused as a module-bound home`);
    }
    void attempts;
    const svcSrc = read("src/modules/platform-admin/server/PlatformAdminServerService.ts");
    assert(!/from\("finance_company_access"\)\.(insert|upsert)|from\("finance_capability_grants"\)\.(insert|upsert)/.test(svcSrc), "the Admin Console service never writes Finance company access or platform_finance grants");
    pass("E provisioning: Finance home provisions with no authority and no facility context; FM context refused for ECC/Finance; non-home workspaces refused");
  }

  // F. UI consumes the registry
  {
    for (const f of ["src/modules/platform-admin/client/PeopleView.tsx", "src/modules/platform-admin/client/PersonView.tsx"]) {
      const s = read(f);
      assert(!/<option value="(facility_management|ecc_operations|platform_finance|command_centre)">/.test(s), `${f.split("/").pop()} has no hard-coded workspace option list`);
      assert(/MODULE_BOUND_HOME_OPTIONS/.test(s), `${f.split("/").pop()} renders homes from the registry`);
    }
    const p = read("src/modules/platform-admin/client/PeopleView.tsx");
    assert(/LANDING_OPTIONS/.test(p) && /facilityContext/.test(p) && /Finance authority is not granted here/.test(p), "landing options from the registry; facility fields conditional on facility context; Finance disclosure shown");
    assert(workspaceEntry("platform_finance")!.label === "Platform Finance", "labels come from the registry");
    pass("F UI: home/landing options and labels come from the registry; facility/role fields only where a facility context exists");
  }

  console.log(out.join("\n"));
  console.log(`\n${out.length} groups passed`);
}
main().catch((e) => { process.stderr.write("FAIL " + (e instanceof Error ? e.stack : String(e)) + "\n"); process.exit(1); });
