/**
 * FM Phase 2L — Apps Script runtime retirement verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-apps-script-retirement.mts
 *
 * Proves Facility Management has zero live Apps Script runtime dependency, the
 * explicit-grant authority model stands alone, and a failed Reporting source can
 * never be read as a healthy zero.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { createElement } from "react";
import { applyPlatformSuperAdmin, resolveOperatingAccessFromGrants } from "../src/lib/access/resolveAccess";
import { SUPER_ADMIN_OVERRIDE_CAPABILITIES, hasCapability } from "../src/lib/access/capabilities";
import { buildOperationalPicture } from "../src/services/reporting/operational-picture/buildOperationalPicture";
import type { OperationalRegistersBundle } from "../src/services/reporting/registers/types";
import { contextAccess } from "./lib/accessFixtures";

void createElement;
type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const read = (p: string) => readFileSync(resolve(p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
async function check(name: string, fn: () => void | Promise<void>) {
  try {
    await fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}
function walk(dir: string, exts: RegExp, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, exts, out);
    else if (exts.test(e)) out.push(f);
  }
  return out;
}
const srcFiles = walk("src", /\.(ts|tsx)$/);

async function main() {
  await check("census: no Apps Script transport, proxy, env var or endpoint anywhere in src (comments aside)", () => {
    const offenders = srcFiles.filter((f) => /appsScriptProxy|postToAppsScript|AppsScriptTransportError|APPS_SCRIPT|script\.google\.com|postGatedOperationalProxy|postFinanceProxyWithProtection/.test(strip(readFileSync(f, "utf8"))));
    assert(offenders.length === 0, offenders.join(", "));
    for (const gone of ["src/services/api/appsScriptProxy.ts", "src/lib/access/postGatedOperationalProxy.ts", "src/lib/access/postFinanceProxyWithProtection.ts", "src/lib/access/operationalIdentity.ts"]) {
      assert(!existsSync(resolve(gone)), `${gone} still exists`);
    }
  });
  await check("no FM API route and no browser service touches Apps Script; envelope type is owned by the app", () => {
    const routes = walk("src/app/api", /route\.ts$/);
    assert(routes.length > 20, "routes not found");
    for (const f of [...routes, ...walk("src/services", /\.ts$/), ...walk("src/modules", /\.(ts|tsx)$/)]) {
      assert(!/apps.?script/i.test(strip(readFileSync(f, "utf8"))), `${f} references Apps Script`);
    }
    assert(existsSync(resolve("src/lib/api/requestEnvelope.ts")), "ApiRequestEnvelope type");
  });
  await check("every FM API route is served by a server-only Supabase service (no proxy remains)", () => {
    const fmRoutes = ["approvals", "assets", "consumables-update", "cost-records", "cost-submissions", "deep-cleaning-log", "diesel-usage", "energy-reading", "facilities", "fumigation-log", "generator-log", "incidents", "maintenance", "master-data", "operational-workload", "reimbursement-authorizations", "reimbursement-payments", "requests", "users", "waste-log", "work-orders"];
    for (const r of fmRoutes) {
      const s = strip(read(`src/app/api/${r}/route.ts`));
      assert(/Fm\w*(Service|Repository)|handleFm\w+Route|Fm\w+/.test(s), `${r}: no Supabase-backed service`);
    }
  });
  await check("no script imports the Apps Script proxy or the retired client; retired live-probe scripts are gone", () => {
    const offenders = walk("scripts", /\.(mts|ts|cjs)$/).filter((f) => !f.endsWith("verify-fm-apps-script-retirement.mts") && /import[^;\n]*appsScriptProxy|require\([^)]*apps-script-client/.test(readFileSync(f, "utf8")));
    assert(offenders.length === 0, offenders.join(", "));
    for (const gone of ["scripts/verify-operational-registers-write.mts", "scripts/lib/apps-script-client.cjs", "scripts/verify-users-deployment.mts", "scripts/provision-operational-identity-link.mts"]) {
      assert(!existsSync(resolve(gone)), `${gone} still exists`);
    }
  });
  await check("authority: no role → capability table or Sheet-user resolver in runtime; role/assignment context grants nothing", () => {
    for (const f of srcFiles) {
      assert(!/ROLE_CAPABILITIES|capabilitiesForRole|resolveOperatingAccessFromSheetUser|findSheetUserByEmail/.test(strip(readFileSync(f, "utf8"))), `${f} still has role-label inference`);
    }
    const fm = contextAccess("fm@example.com", "FM", { id: "p1", name: "FM", email: "fm@example.com", role: "Facility Manager", status: "active", facility: "NCC Annex" });
    assert(fm.role === "facility_manager" && fm.capabilities.length === 0, "an operating role must confer no capability");
  });
  await check("authority: explicit grants are authoritative; Super Admin gets platform administration only", () => {
    assert(SUPER_ADMIN_OVERRIDE_CAPABILITIES.join() === "users.view,users.manage,platform.admin_override", "override set");
    const granted = resolveOperatingAccessFromGrants({ email: "a@x.com", name: "A", role: null, capabilities: ["ops.view"] });
    assert(hasCapability(granted.capabilities, "ops.view") && !hasCapability(granted.capabilities, "ops.create"), "exact grants only");
    const sa = applyPlatformSuperAdmin(resolveOperatingAccessFromGrants({ email: "s@x.com", name: "S", role: "facility_manager", capabilities: [] }), true);
    for (const c of ["ops.view", "finance.pay", "approvals.manage", "requests.view", "fm.authorize_protected"] as const) assert(!hasCapability(sa.capabilities, c), `SA holds ${c}`);
  });
  await check("Reporting: a FAILED register is unavailable (null count, unavailable flag, derived marked) — never a healthy zero", () => {
    const empty = { generatorLogs: [], energyReadings: [], dieselUsage: [], consumablesUpdates: [], wasteLogs: [], fumigationLogs: [], deepCleaningLogs: [] };
    const healthy = buildOperationalPicture({ asOf: "2026-09-19T00:00:00Z", ...empty, meta: { requested: [], loaded: [], failed: [], omitted: [], facilityFilterUnsupported: [] } } as OperationalRegistersBundle);
    assert(healthy.registers.dieselUsage.count === 0 && healthy.registers.dieselUsage.unavailable === false && healthy.derived.unavailable.length === 0, "healthy empty stays zero");
    const failed = buildOperationalPicture({ asOf: "2026-09-19T00:00:00Z", ...empty, meta: { requested: [], loaded: [], failed: ["diesel-usage", "fumigation-log", "consumables-update"], omitted: [], facilityFilterUnsupported: [] } } as OperationalRegistersBundle);
    assert(failed.registers.dieselUsage.count === null && failed.registers.dieselUsage.unavailable === true && failed.registers.dieselUsage.latest === null, "failed register section");
    assert(failed.registers.wasteLog.count === 0 && failed.registers.wasteLog.unavailable === false, "unrelated healthy register unaffected");
    for (const k of ["dieselHighUsage", "dieselNegativeConsumption", "consumablesReorder", "fumigationOverdue", "fumigationDueSoon", "fumigationScheduled"] as const) {
      assert(failed.derived.unavailable.includes(k), `${k} must be marked unavailable, not "none"`);
    }
    assert(failed.meta.failed.length === 3, "meta preserved");
  });
  await check("Reporting: a single-register read throws on failure instead of returning []", async () => {
    (globalThis as { fetch: unknown }).fetch = async () => new Response(JSON.stringify({ success: false, message: "down" }), { status: 400 });
    const { OperationalRegistersReadService, OperationalRegisterUnavailableError } = await import("../src/services/reporting/registers/OperationalRegistersReadService");
    let threw = false;
    try {
      await OperationalRegistersReadService.listRegister("waste-log");
    } catch (e) {
      threw = e instanceof OperationalRegisterUnavailableError;
    }
    assert(threw, "failure was swallowed into an empty array");
    (globalThis as { fetch: unknown }).fetch = async () =>
      new Response(JSON.stringify({ success: true, message: "", data: { data: [], page: 1, pageSize: 500, total: 0, totalPages: 1 } }), { status: 200, headers: { "Content-Type": "application/json" } });
    const rows = await OperationalRegistersReadService.listRegister("diesel-usage");
    assert(Array.isArray(rows) && rows.length === 0, "healthy empty register is a zero-length list");
  });
  await check("operational_identity_links: no live FM runtime consumer; only Admin display/offboarding read it", () => {
    const users = srcFiles.filter((f) => /operational_identity_links/.test(strip(readFileSync(f, "utf8"))));
    assert(users.every((f) => f.includes("platform-admin")), `non-admin consumer: ${users.filter((f) => !f.includes("platform-admin")).join(", ")}`);
  });
  await check("retirement boundary is documented and the Apps Script pack rule is marked historical", () => {
    const doc = read("docs/fm-runtime-architecture.md");
    for (const phrase of ["Supabase / Postgres", "not an FM runtime source", "reference only", "profile UUIDs", "Display codes are not relational identity", "Explicit capability grants", "Zero is data"]) {
      assert(doc.includes(phrase), `doc missing: ${phrase}`);
    }
    assert(read("AGENTS.md").includes("docs/fm-runtime-architecture.md") && /historical source only/i.test(read("AGENTS.md")), "AGENTS.md pointer");
  });

  let failed = 0;
  for (const r of results) {
    if (!r.ok) failed += 1;
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0 ? "FM_APPS_SCRIPT_RETIREMENT: PASS" : "FM_APPS_SCRIPT_RETIREMENT: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main();
