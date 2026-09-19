/**
 * FM Phase 2J — Vendors foundation & cutover verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-vendors-foundation.mts
 *
 * Static + pure-domain always. Linked DB integrity: verify-fm-phase-2j-rollback.sql
 * (rollback-only), verify-fm-phase-2j-objects.sql and verify-fm-vendors-live-read.mts.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  FmVendorValidationError,
  isVendorPayload,
  mapFmVendorRow,
  parseCreateVendorInput,
  parseUpdateVendorInput,
  parseVendorListParams,
  type FmVendorRow,
} from "../src/modules/master-data/server/fmVendorDomain";

type Result = { name: string; ok: boolean; detail?: string };
const results: Result[] = [];
const read = (p: string) => readFileSync(resolve(p), "utf8");
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}
function check(name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (e) {
    results.push({ name, ok: false, detail: e instanceof Error ? e.message : String(e) });
  }
}
function throwsValidation(fn: () => unknown, label: string) {
  try {
    fn();
  } catch (e) {
    assert(e instanceof FmVendorValidationError, `${label}: wrong error`);
    return;
  }
  throw new Error(`${label}: expected a validation error`);
}
function walk(dir: string, out: string[] = []): string[] {
  for (const e of readdirSync(dir)) {
    const f = join(dir, e);
    if (statSync(f).isDirectory()) walk(f, out);
    else if (/\.(ts|tsx)$/.test(e)) out.push(f);
  }
  return out;
}

const migration = read("supabase/migrations/20260919230000_fm_vendors.sql");
const route = read("src/app/api/master-data/route.ts");
const repo = read("src/modules/master-data/server/FmVendorRepository.ts");
const service = read("src/modules/master-data/server/FmVendorServerService.ts");
const row: FmVendorRow = {
  id: "00000000-0000-4000-8000-000000000001", organisation_id: "00000000-0000-4000-8000-000000000009", name: "Cool Air", code: null,
  category: "HVAC", contact_name: null, email: null, phone: null, description: null, status: "active",
  created_by_profile_id: null, updated_by_profile_id: null, created_at: "2026-09-19T10:00:00Z", updated_at: "2026-09-19T10:00:00Z",
};

check("migration: fm_vendors, RLS, service-role only, tenant-safe actor FKs", () => {
  assert(migration.includes("create table public.fm_vendors"), "table");
  assert(migration.includes("alter table public.fm_vendors enable row level security"), "RLS");
  assert(migration.includes("revoke all on table public.fm_vendors from public, anon, authenticated") && migration.includes("grant all on table public.fm_vendors to service_role"), "grants");
  assert(!/create policy/i.test(migration), "no JWT policies");
  assert(/foreign key \(organisation_id, created_by_profile_id\)/.test(migration), "composite actor FK");
});
check("migration: bounded FM concept — no procurement, finance or counterparty coupling", () => {
  const sql = migration.replace(/--.*$/gm, "");
  assert(!/references public\.(organisation_counterparties|finance_|fm_(?!vendors))/.test(sql), "cross-domain FK");
  assert(!/contract|purchase|bank|tax|score|compliance|invoice|payable|ledger|approval/i.test(sql), "invented vendor semantics");
});
check("domain: create/update/list parsing and validation", () => {
  const ok = parseCreateVendorInput({ entity: "vendors", name: " Cool Air ", category: "hvac", email: "a@b.co", status: "Pending" });
  assert(ok.name === "Cool Air" && ok.category === "HVAC" && ok.status === "pending", "normalised");
  assert(parseCreateVendorInput({ name: "X" }).status === "active", "default active");
  throwsValidation(() => parseCreateVendorInput({}), "no name");
  throwsValidation(() => parseCreateVendorInput({ name: "X", category: "Plumbers" }), "bad category");
  throwsValidation(() => parseCreateVendorInput({ name: "X", email: "nope" }), "bad email");
  throwsValidation(() => parseCreateVendorInput({ name: "X", status: "suspended" }), "bad status");
  throwsValidation(() => parseUpdateVendorInput({ name: "X" }), "id required");
  assert(parseUpdateVendorInput({ id: "v", email: "" }).email === null, "clear optional field");
  const list = parseVendorListParams({ page: 0, pageSize: 99999, status: "all", category: "all" });
  assert(list.page === 1 && list.pageSize === 500 && list.status === undefined && list.category === undefined, "list defaults");
  assert(isVendorPayload({ entity: "Vendors" }) && !isVendorPayload({ entity: "rooms" }), "entity detection");
});
check("mapping: UUID id, optional code/contact preserved as empty, never invented", () => {
  const m = mapFmVendorRow(row);
  assert(m.id === row.id && m.code === "" && m.contactName === undefined && m.category === "HVAC", "map");
});
check("server layer: server-only, tenant-scoped, never deletes, no Apps Script / identity links", () => {
  assert(repo.startsWith('import "server-only"') && service.startsWith('import "server-only"'), "server-only");
  assert(repo.includes('.eq("organisation_id", this.organisationId)'), "tenant scope");
  assert(!/\.delete\(\)/.test(repo), "vendors are never deleted");
  assert(!/postToAppsScript|appsScriptProxy|operational_identity_links/.test(repo + service + route), "legacy");
});
check("route: vendors served by Supabase; authorization unchanged; no Apps Script anywhere in master-data", () => {
  assert(route.includes("FmVendorServerService") && route.includes("isVendorPayload"), "vendor branch");
  assert(route.includes('capabilityForOperationalProxyAction(\n      "master-data"') || route.includes('capabilityForOperationalProxyAction("master-data"'), "same ops.* gate");
  assert(!/postToAppsScript|appsScriptProxy/.test(strip(route)), "route still imports Apps Script");
  const offenders = [...walk("src/modules/master-data"), ...walk("src/services/masterData")].filter((f) => /postToAppsScript|appsScriptProxy/.test(strip(readFileSync(f, "utf8"))));
  assert(offenders.length === 0, offenders.join(", "));
  assert(route.includes("FmVendorUnavailableError") && /fail\(503/.test(route), "failure is 503, never empty");
});
check("no FM runtime caller of the Vendor Apps Script service", () => {
  const offenders = walk("src").filter((f) => /resource:\s*"master-data"/.test(strip(readFileSync(f, "utf8"))) && /postToAppsScript/.test(strip(readFileSync(f, "utf8"))));
  assert(offenders.length === 0, offenders.join(", "));
});
check("no Platform Finance coupling in the FM Vendor layer", () => {
  assert(!/platform-finance|platform_finance|counterpart|vendor_bill|finance_/i.test(strip(repo + service + read("src/modules/master-data/server/fmVendorDomain.ts"))), "coupling");
});
check("no FM table stores a vendor reference; nothing was linked speculatively", () => {
  const others = readdirSync("supabase/migrations").filter((f) => /^2026091[89]/.test(f) && !/fm_vendors|finance|counterpart/.test(f));
  for (const f of others) {
    const sql = read(`supabase/migrations/${f}`).replace(/--.*$/gm, "");
    assert(!/\bvendor_(id|ref)\b/.test(sql), `${f} stores a vendor reference`);
  }
});
check("browser client unchanged in contract and free of Apps Script", () => {
  const client = read("src/services/masterData/MasterDataService.ts");
  assert(!/postToAppsScript|appsScriptProxy/.test(client) && client.includes('"/master-data"'), "client");
});
check("rollback probe present", () => {
  assert(existsSync(resolve("scripts/verify-fm-phase-2j-rollback.sql")), "probe");
});

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed === 0 ? "FM_VENDORS_FOUNDATION: PASS" : "FM_VENDORS_FOUNDATION: FAIL");
process.exit(failed === 0 ? 0 : 1);
