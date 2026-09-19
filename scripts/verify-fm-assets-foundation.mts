/**
 * FM Phase 2H — Assets foundation & cutover verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-assets-foundation.mts
 *
 * Static + pure-domain always. Linked DB integrity is proven by
 * scripts/verify-fm-phase-2h-rollback.sql (rollback-only) and
 * scripts/verify-fm-assets-live-read.mts (read-only).
 */
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  FmAssetValidationError,
  generateNextAssetCode,
  mapFmAssetRow,
  parseAssetListParams,
  parseCreateAssetInput,
  parseUpdateAssetInput,
  uuidsOnly,
  type FmAssetRow,
} from "../src/modules/assets/server/fmAssetDomain";
import { resolveScopedFacilityId } from "../src/lib/platform/scopedFacility";

type CheckResult = { name: string; status: "PASS" | "FAIL"; detail?: string };

const MIGRATION = "supabase/migrations/20260919210000_fm_assets.sql";
const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const readSrc = (path: string) => readFileSync(resolve(path), "utf8");
function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}
function check(results: CheckResult[], name: string, fn: () => void) {
  try {
    fn();
    results.push({ name, status: "PASS" });
  } catch (error) {
    results.push({ name, status: "FAIL", detail: error instanceof Error ? error.message : String(error) });
  }
}
function throwsValidation(fn: () => unknown, label: string) {
  try {
    fn();
  } catch (error) {
    assert(error instanceof FmAssetValidationError, `${label}: wrong error type`);
    return;
  }
  throw new Error(`${label}: expected a validation error`);
}
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}
const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

const row: FmAssetRow = {
  id: U(1), organisation_id: U(9), code: "AST-2026-000001", facility_id: U(2), name: "Pump", category: "mechanical",
  manufacturer: null, model: null, serial_number: null, install_date: null, warranty_expiry: null, oem_id: null,
  condition: "good", status: "pending", criticality: "unassessed", assigned_to_profile_id: U(3),
  created_by_profile_id: U(3), updated_by_profile_id: U(3), created_at: "2026-09-19T10:00:00Z", updated_at: "2026-09-19T10:00:00Z",
};

function main() {
  const results: CheckResult[] = [];
  const migration = readSrc(MIGRATION);
  const repo = readSrc("src/modules/assets/server/FmAssetRepository.ts");
  const service = readSrc("src/modules/assets/server/FmAssetServerService.ts");
  const route = readSrc("src/app/api/assets/route.ts");
  const client = readSrc("src/services/assets/AssetService.ts");

  // ------------------------------------------------------------- schema
  check(results, "migration: fm_assets, RLS, service-role only, tenant-safe FKs", () => {
    assert(migration.includes("create table public.fm_assets"), "table");
    assert(migration.includes("alter table public.fm_assets enable row level security"), "RLS");
    assert(migration.includes("revoke all on table public.fm_assets from public, anon, authenticated"), "revoke");
    assert(migration.includes("grant all on table public.fm_assets to service_role"), "grant");
    assert(!/create policy/i.test(migration), "no JWT policies");
    assert(/foreign key \(organisation_id, facility_id\)/.test(migration), "facility composite FK");
    assert(/foreign key \(organisation_id, assigned_to_profile_id\)/.test(migration), "assignee composite FK");
    assert(migration.includes("fm_assets_org_code_uidx"), "unique code per org");
  });
  check(results, "migration: asset_ref replaced by guarded asset_id UUID FKs on the three domains", () => {
    assert(migration.includes("refusing to drop"), "populated-data guard");
    for (const t of ["fm_incidents", "fm_work", "fm_work_instructions"]) {
      assert(new RegExp(`alter table public\\.${t} drop column asset_ref`).test(migration), `${t} drops asset_ref`);
      assert(new RegExp(`alter table public\\.${t} add column asset_id uuid`).test(migration), `${t} adds asset_id`);
    }
    assert((migration.match(/foreign key \(organisation_id, asset_id, facility_id\)/g) ?? []).length === 3, "facility-consistent composite FKs");
    assert(!/asset_(code|name)/.test(migration.replace(/--.*$/gm, "")), "no code/name relationship column");
  });
  check(results, "migration: no facility NAME or free-text assignee columns; no invented CMMS fields", () => {
    const table = migration.match(/create table public\.fm_assets[\s\S]*?\n\);/)?.[0] ?? "";
    assert(!/\bfacility text|facility_name|\bassigned_to text|vendor|building|floor|room|work_order/i.test(table), "forbidden column");
  });

  // ------------------------------------------------------------- domain
  check(results, "asset code sequence", () => {
    const now = new Date("2026-09-19T00:00:00Z");
    assert(generateNextAssetCode(null, now) === "AST-2026-000001", "first");
    assert(generateNextAssetCode("AST-2026-000009", now) === "AST-2026-000010", "next");
    assert(generateNextAssetCode("AST-2025-000900", now) === "AST-2026-000001", "year rollover");
  });
  check(results, "create: requires name + facility; enums validated; legacy name/free-text ignored", () => {
    const ok = parseCreateAssetInput({ name: "Pump", facilityId: U(2), category: "hvac", status: "active" });
    assert(ok.facilityRef === U(2) && ok.category === "hvac", "valid");
    throwsValidation(() => parseCreateAssetInput({ facilityId: U(2) }), "no name");
    throwsValidation(() => parseCreateAssetInput({ name: "Pump" }), "no facility");
    throwsValidation(() => parseCreateAssetInput({ name: "Pump", facility: "NCC Annex" }), "facility NAME is not accepted as identity");
    throwsValidation(() => parseCreateAssetInput({ name: "P", facilityId: U(2), category: "plumbing" }), "bad category");
    throwsValidation(() => parseCreateAssetInput({ name: "P", facilityId: U(2), assignedToUserId: "Daniel Mensah" }), "assignee must be a UUID");
    const clean = parseCreateAssetInput({ name: "P", facilityId: U(2), assignedTo: "Daniel Mensah" }) as Record<string, unknown>;
    assert(!("assignedTo" in clean) && clean.assignedToUserId === undefined, "free-text assignee ignored");
  });
  check(results, "update/list parsing; category tokens normalised; dates", () => {
    const upd = parseUpdateAssetInput({ id: "AST-2026-000001", status: "Inactive", installDate: "2026-08-25T07:00:00.000Z", assignedToUserId: "" });
    assert(upd.status === "inactive" && upd.installDate === "2026-08-25" && upd.assignedToUserId === null, "normalised");
    throwsValidation(() => parseUpdateAssetInput({ name: "x" }), "id required");
    throwsValidation(() => parseUpdateAssetInput({ id: "x", installDate: "not-a-date" }), "bad date");
    const list = parseAssetListParams({ page: 0, pageSize: 100000, status: "all", category: "all", sort: "bogus" });
    assert(list.page === 1 && list.pageSize === 500 && list.status === undefined && list.sort === "newest", "list defaults + clamps");
    throwsValidation(() => parseAssetListParams({ status: "retired" }), "bad status filter");
  });
  check(results, "row mapping: UUID id, code display-only, facility/assignee projected, empties preserved", () => {
    const m = mapFmAssetRow(row, { facilityName: "NCC Annex", assignedToName: "Ada" });
    assert(m.id === U(1) && m.code === "AST-2026-000001" && m.facilityId === U(2) && m.facility === "NCC Annex", "identity");
    assert(m.assignedToUserId === U(3) && m.assignedTo === "Ada", "assignee");
    const bare = mapFmAssetRow({ ...row, assigned_to_profile_id: null });
    assert(bare.assignedToUserId === "" && bare.manufacturer === "", "unassigned is empty, not invented");
  });
  check(results, "workload lookups accept UUIDs only (a code is not a relationship key)", () => {
    assert(uuidsOnly(["AST-2026-000001", U(1), U(1), " " + U(2)]).join() === [U(1), U(2)].join(), "uuid filter");
  });

  // ------------------------------------------------------------- server
  check(results, "asset server layer: server-only, no Apps Script, no identity links", () => {
    assert(repo.startsWith('import "server-only"') && service.startsWith('import "server-only"'), "server-only");
    assert(!/postToAppsScript|appsScriptProxy|operational_identity_links/.test(repo + service + route), "no legacy");
    assert(repo.includes('.eq("organisation_id", this.organisationId)'), "tenant-scoped");
    assert(repo.includes("_code_uidx"), "code retry keyed to the code index");
    assert(!/\.delete\(\)/.test(repo), "assets are never deleted");
  });
  check(results, "route: Supabase service, capability-gated, unknown action rejected", () => {
    assert(route.includes("FmAssetServerService") && !route.includes("postGatedOperationalProxy"), "handler");
    assert(route.includes('capabilityForOperationalProxyAction("assets", action)'), "gate");
    assert(route.includes("Unknown assets action"), "unknown action");
  });
  check(results, "browser client: apiClient only; failure is not a healthy empty page", () => {
    assert(!/postToAppsScript|appsScriptProxy/.test(client), "apps script");
    assert(client.includes("invalid response"), "malformed response is an error");
    assert(!client.includes("facilitiesEquivalent") && !client.includes("loadFacilityNameById"), "no facility-name matching");
  });
  check(results, "operational repos resolve Asset refs to UUIDs and store asset_id only", () => {
    for (const f of [
      "src/modules/incidents/server/FmIncidentRepository.ts",
      "src/modules/maintenance/server/FmWorkRepository.ts",
      "src/modules/work-orders/server/FmWorkInstructionRepository.ts",
    ]) {
      const src = readSrc(f);
      assert(src.includes("resolveAssetRef") && src.includes("FmAssetRepository"), `${f} resolves refs`);
      assert(!/asset_ref/.test(src), `${f} still uses asset_ref`);
      assert(src.includes("_asset_fk"), `${f} maps facility-mismatch FK`);
    }
    assert(!/asset_ref|activeByAssetRefs/.test(readSrc("src/app/api/operational-workload/route.ts")), "workload route");
  });
  check(results, "no live Asset path reads/writes Apps Script; no asset_ref anywhere in src", () => {
    const offenders = walk("src").filter((f) => {
      const s = stripComments(readFileSync(f, "utf8"));
      return /asset_ref\b/.test(s) || (/resource:\s*"assets"/.test(s) && /postToAppsScript/.test(s));
    });
    assert(offenders.length === 0, offenders.join(", "));
  });
  check(results, "no facility-name matching for assets in forms/reporting", () => {
    const offenders = walk("src").filter((f) => /asset\.facility\s*===/.test(readFileSync(f, "utf8")));
    assert(offenders.length === 0, offenders.join(", "));
  });
  check(results, "reporting: Supabase assets override the Sheet snapshot; failed source is degraded, not zero", () => {
    const rs = readSrc("src/services/reporting/ReportingService.ts");
    assert(rs.includes("loadAuthoritativeAssets") && /assets: filterByFacilityId\(assets\.rows/.test(rs), "override");
    assert(rs.includes("assets: assets.ok"), "source health");
  });

  // ------------------------------------------------------------- facility scope
  check(results, "scoped facility: canonical UUID, no FAC-0001, no facilities[0] fallback", () => {
    const src = stripComments(readSrc("src/lib/platform/scopedFacility.ts"));
    assert(!src.includes("FAC-0001") && !/facilities\[0\]\?/.test(src), "legacy fallback present");
    const A = { id: U(1) }, B = { id: U(2) }, C = { id: U(3) };
    assert(resolveScopedFacilityId([A, B, C], undefined, U(2)) === U(2), "assignment wins");
    assert(resolveScopedFacilityId([A, B, C], U(3), U(2)) === U(3), "record facility wins");
    assert(resolveScopedFacilityId([A, B, C], undefined, undefined) === "", "no scope → empty, not facilities[0]");
    assert(resolveScopedFacilityId([A, B, C], undefined, U(9)) === "", "unknown assignment → empty");
    assert(resolveScopedFacilityId([A, B, C], "FAC-0001", undefined) === "", "legacy code is not an identity");
    assert(resolveScopedFacilityId([B], undefined, undefined) === U(2), "sole facility is unambiguous");
    assert(resolveScopedFacilityId([], undefined, undefined) === "", "none");
    const access = readSrc("src/lib/access/server.ts");
    assert(access.includes("facilityId,"), "assignment UUID exposed on OperatingAccess");
  });
  check(results, "validation probe present", () => {
    assert(existsSync(resolve("scripts/verify-fm-phase-2h-rollback.sql")), "rollback probe present");
  });

  let failed = 0;
  for (const r of results) {
    if (r.status === "FAIL") failed += 1;
    console.log(`${r.status}  ${r.name}${r.detail ? `\n      ${r.detail}` : ""}`);
  }
  console.log(`\n${results.length - failed}/${results.length} passed`);
  console.log(failed === 0 ? "FM_ASSETS_FOUNDATION: PASS" : "FM_ASSETS_FOUNDATION: FAIL");
  process.exit(failed === 0 ? 0 : 1);
}

main();
