/**
 * FM Phase 2K — operational logs foundation & cutover verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-logs-foundation.mts
 *
 * Static + pure-domain always. Linked DB behaviour: verify-fm-phase-2k-rollback.sql
 * (rollback-only), verify-fm-phase-2k-objects.sql, verify-fm-logs-live-read.mts.
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  FM_LOG_RESOURCES,
  FM_LOG_SPECS,
  FmLogValidationError,
  generateNextLogCode,
  normalizeDate,
  parseLogListParams,
} from "../src/modules/operational-logs/server/fmLogDomain";

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
    assert(e instanceof FmLogValidationError, `${label}: wrong error type`);
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

const migration = read("supabase/migrations/20260919240000_fm_operational_logs.sql");
const sql = migration.replace(/--.*$/gm, "");
const repo = read("src/modules/operational-logs/server/FmLogRepository.ts");
const service = read("src/modules/operational-logs/server/FmLogServerService.ts");
const routeHelper = read("src/modules/operational-logs/server/fmLogRoute.ts");
const FAC = "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0";

check("model: eight purpose-built tables — no generic payload table, no union table", () => {
  const tables = [...sql.matchAll(/create table public\.(\w+)/g)].map((m) => m[1]);
  assert(tables.length === 8, `expected 8 tables, got ${tables.length}`);
  assert(!/jsonb|payload|log_type|\btype text/i.test(sql.replace(/gen_random_uuid|timestamptz/g, "")), "generic/JSON storage");
  assert(!tables.includes("fm_operational_logs"), "generic log table");
});
check("schema: RLS, service-role only, tenant-safe facility + actor FKs, unique display codes", () => {
  for (const t of ["fm_generator_logs", "fm_energy_readings", "fm_diesel_usage", "fm_waste_logs", "fm_fumigation_logs", "fm_deep_cleaning_logs", "fm_consumables_items", "fm_consumables_updates"]) {
    assert(sql.includes(`alter table public.${t} enable row level security`), `${t} RLS`);
  }
  assert(/revoke all on table[\s\S]*from public, anon, authenticated/.test(sql) && /grant all on table[\s\S]*to service_role/.test(sql), "grants");
  assert(!/create policy/i.test(sql), "JWT policies");
  assert((sql.match(/foreign key \(organisation_id, facility_id\)/g) ?? []).length >= 6, "facility composite FKs");
  assert((sql.match(/_org_code_uidx/g) ?? []).length >= 8, "unique codes");
});
check("facility scope follows the product: generator & energy are organisation-level; the other five require a facility", () => {
  for (const r of FM_LOG_RESOURCES) {
    const spec = FM_LOG_SPECS[r];
    assert(spec.facility === !(r === "generator-log" || r === "energy-reading"), `${r} facility flag`);
  }
  const gen = sql.match(/create table public\.fm_generator_logs[\s\S]*?\n\);/)?.[0] ?? "";
  assert(!/facility_id/.test(gen), "generator logs must not invent a facility column");
});
check("derived values are GENERATED columns and can never be supplied (hours, consumption, closing)", () => {
  assert(/hours numeric\(10, 2\) generated always as/.test(sql), "hours");
  assert(/consumption numeric\(12, 2\) generated always as/.test(sql), "consumption");
  assert(/closing numeric\(14, 2\) generated always as/.test(sql), "closing");
  const g = FM_LOG_SPECS["generator-log"].parseCreate({ date: "2026-09-19", generator: "G", startedAt: "2026-09-19T08:00:00Z", endedAt: "2026-09-19T10:00:00Z", fuelUsed: 3, hours: 999 });
  assert(!("hours" in g.columns), "supplied hours must be ignored");
  const d = FM_LOG_SPECS["diesel-usage"].parseCreate({ date: "2026-09-19", facilityId: FAC, generatorId: "GEN-1", openingLevel: 100, closingLevel: 90, consumption: 999 });
  assert(!("consumption" in d.columns) && d.columns.added === 0, "supplied consumption ignored; added defaults to 0");
  const c = FM_LOG_SPECS["consumables-update"].parseCreate({ date: "2026-09-19", facilityId: FAC, itemName: "Soap", opening: 10, issued: 2, closing: 999 });
  assert(!("closing" in c.columns) && c.columns.received === 0, "supplied closing ignored");
});
check("domain-specific required fields and validation", () => {
  const G = FM_LOG_SPECS["generator-log"], E = FM_LOG_SPECS["energy-reading"], D = FM_LOG_SPECS["diesel-usage"], W = FM_LOG_SPECS["waste-log"], F = FM_LOG_SPECS["fumigation-log"], C = FM_LOG_SPECS["deep-cleaning-log"], K = FM_LOG_SPECS["consumables-update"];
  throwsValidation(() => G.parseCreate({ date: "2026-09-19", generator: "G", startedAt: "2026-09-19T08:00:00Z", fuelUsed: 1 }), "generator needs End");
  throwsValidation(() => G.parseCreate({ date: "bad", generator: "G", startedAt: "2026-09-19T08:00:00Z", endedAt: "2026-09-19T09:00:00Z", fuelUsed: 1 }), "bad date");
  throwsValidation(() => E.parseCreate({ date: "2026-09-19", meter: "M" }), "energy needs reading");
  throwsValidation(() => E.parseCreate({ date: "2026-09-19", meter: "M", reading: "abc" }), "reading must be numeric");
  throwsValidation(() => D.parseCreate({ date: "2026-09-19", generatorId: "G", openingLevel: 1, closingLevel: 1 }), "diesel needs a facility — never guessed");
  throwsValidation(() => W.parseCreate({ date: "2026-09-19", facilityId: FAC, wasteType: "General", quantity: 1, unit: "kg" }), "waste needs disposal method");
  throwsValidation(() => F.parseCreate({ date: "2026-09-19", facilityId: FAC, areaTreated: "K", pestType: "R", vendor: "V" }), "fumigation needs next due date");
  throwsValidation(() => C.parseCreate({ date: "2026-09-19", facilityId: FAC, area: "L", vendorTeam: "T" }), "deep cleaning needs status");
  throwsValidation(() => K.parseCreate({ date: "2026-09-19", facilityId: FAC, itemName: "Soap", opening: 1 }), "consumables needs issued");
  assert(normalizeDate("2026-09-19T23:00:00.000Z", "d") === "2026-09-19", "ISO datetime → calendar date");
  assert(C.parseCreate({ date: "2026-09-19", facilityId: FAC, area: "L", vendorTeam: "T", status: "Any Free Text" }).columns.status === "Any Free Text", "deep-cleaning status is free text (no enum invented)");
});
check("update parsing validates only what is supplied; blank required text is rejected; ids required", () => {
  const W = FM_LOG_SPECS["waste-log"];
  assert(W.parseUpdate({ id: "WLOG-2026-000001", quantity: 2 }).columns.quantity === 2, "partial update");
  throwsValidation(() => W.parseUpdate({ id: "x", unit: "  " }), "blank unit");
  throwsValidation(() => W.parseUpdate({ unit: "kg" }), "id required");
  assert(FM_LOG_SPECS["energy-reading"].parseUpdate({ id: "x", remarks: "" }).columns.remarks === null, "clear optional remarks");
});
check("vendor is TEXT on fumigation / deep cleaning — no fm_vendors link, no name-based identity", () => {
  assert(!/references\s+public\.fm_vendors/.test(sql), "migration has a foreign key to fm_vendors");
  assert(/vendor_name text not null/.test(sql) && /vendor_team text not null/.test(sql), "text labels");
  assert(!/fm_vendors|FmVendor/.test(strip(repo + service + read("src/modules/operational-logs/server/fmLogDomain.ts"))), "server layer resolves vendors");
});
check("consumables: explicit per-facility item identity replaces repeated name matching", () => {
  assert(/fm_consumables_updates_item_fk foreign key \(organisation_id, item_id, facility_id\)/.test(sql), "item FK keeps facility consistent");
  assert(/fm_consumables_items_facility_name_uidx/.test(sql), "one item per (facility, name)");
  assert(repo.includes("findOrCreateItem") && repo.includes("carriedReorder"), "item + reorder carry-forward");
});
check("list params: bounded paging, filters and sorts preserved (incl. fumigation next-due)", () => {
  const p = parseLogListParams(FM_LOG_SPECS["fumigation-log"], { page: 0, pageSize: 100000, sort: "next_due_asc", facilityId: "all", nextDueFrom: "2026-09-01" });
  assert(p.page === 1 && p.pageSize === 500 && p.sort === "next_due_asc" && p.facilityId === undefined && p.extras.nextDueFrom === "2026-09-01", "fumigation");
  assert(parseLogListParams(FM_LOG_SPECS["generator-log"], { sort: "bogus", facilityId: FAC }).facilityId === undefined, "generator ignores facility filter; bad sort → newest");
  assert(parseLogListParams(FM_LOG_SPECS["deep-cleaning-log"], { status: "completed" }).status === "completed", "status filter");
});
check("mapping: id is the display code, uuid carried separately; codes are sequenced per domain", () => {
  const row = { id: "00000000-0000-4000-8000-000000000001", code: "WLOG-2026-000001", log_date: "2026-09-19", facility_id: FAC, waste_type: "General", quantity: "1.500", unit: "kg", disposal_method: "Landfill", remarks: null, created_by_profile_id: null, updated_by_profile_id: null, created_at: "x", updated_at: "y" };
  const m = FM_LOG_SPECS["waste-log"].map(row);
  assert(m.id === "WLOG-2026-000001" && m.logUuid === row.id && m.quantity === 1.5 && m.remarks === undefined && m.facilityId === FAC, "map");
  assert(generateNextLogCode("WLOG", "WLOG-2026-000009", new Date("2026-09-19T00:00:00Z")) === "WLOG-2026-000010", "code sequence");
});
check("server layer: server-only, tenant-scoped, no Apps Script, no identity links, no deletes", () => {
  for (const s of [repo, service, routeHelper]) assert(s.startsWith('import "server-only"'), "server-only");
  assert(repo.includes('.eq("organisation_id", this.organisationId)'), "tenant scoped");
  assert(!/postToAppsScript|appsScriptProxy|operational_identity_links/.test(strip(repo + service + routeHelper)), "legacy");
  assert(!/\.delete\(\)/.test(repo), "logs are never deleted");
  assert(!/facilities\[0\]|FAC-0001/.test(strip(repo + service)), "guessed facility");
});
check("all seven routes use the Supabase handler with the unchanged ops.* gate; failure is 503", () => {
  for (const r of FM_LOG_RESOURCES) {
    const src = read(`src/app/api/${r}/route.ts`);
    assert(src.includes("handleFmLogRoute") && src.includes(`"${r}"`), `${r} handler`);
    assert(!/postGatedOperationalProxy|postToAppsScript/.test(src), `${r} still proxies Apps Script`);
  }
  assert(routeHelper.includes("capabilityForOperationalProxyAction(resource, action)") && routeHelper.includes("fail(503"), "gate + 503");
});
check("no live FM runtime path calls Apps Script; dead proxy helpers are gone", () => {
  assert(!existsSync(resolve("src/lib/access/postGatedOperationalProxy.ts")) && !existsSync(resolve("src/lib/access/postFinanceProxyWithProtection.ts")), "dead helpers remain");
  const offenders = walk("src").filter((f) => /postToAppsScript(Data)?\s*\(|postGatedOperationalProxy|postFinanceProxyWithProtection/.test(strip(readFileSync(f, "utf8"))) && !f.endsWith("appsScriptProxy.ts") && !f.endsWith("services/api/index.ts"));
  assert(offenders.length === 0, offenders.join(", "));
  const importers = walk("src").filter((f) => /import\s+(?!type)[^;]*from\s+["']@\/services\/api\/appsScriptProxy["']/.test(strip(readFileSync(f, "utf8"))) && !f.endsWith("services/api/index.ts"));
  assert(importers.length === 0, `runtime importers of the Apps Script proxy: ${importers.join(", ")}`);
});
check("browser clients keep their contract and stay free of Apps Script", () => {
  for (const d of ["generatorLog", "energyReading", "dieselUsage", "wasteLog", "fumigationLog", "deepCleaningLog", "consumablesUpdate"]) {
    const dir = `src/services/${d}`;
    for (const f of readdirSync(dir)) {
      const s = strip(read(`${dir}/${f}`));
      assert(!/appsScriptProxy|postToAppsScript/.test(s), `${d} imports Apps Script`);
    }
  }
});
check("no Platform Finance coupling in the FM log layer", () => {
  assert(!/platform-finance|platform_finance|counterpart|vendor_bill|finance_/i.test(sql + strip(repo + service)), "coupling");
});
check("rollback probe present", () => {
  assert(existsSync(resolve("scripts/verify-fm-phase-2k-rollback.sql")), "probe");
});

let failed = 0;
for (const r of results) {
  if (!r.ok) failed += 1;
  console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
}
console.log(`\n${results.length - failed}/${results.length} passed`);
console.log(failed === 0 ? "FM_LOGS_FOUNDATION: PASS" : "FM_LOGS_FOUNDATION: FAIL");
process.exit(failed === 0 ? 0 : 1);
