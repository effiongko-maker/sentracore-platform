/**
 * FM Phase 1B — facilities & location foundation verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-facilities-foundation.mts
 *
 * Static always. Database suite requires PLATFORM_FINANCE_VERIFY_DATABASE_URL
 * (transactional ROLLBACK — no persistent business rows).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accessCan,
  applyPlatformSuperAdmin,
  resolveOperatingAccessFromSheetUser,
} from "../src/lib/access";
import {
  filterFacilityRows,
  generateNextFacilityCode,
  mapFmFacilityRowToApi,
  paginateRows,
  parseCreateFacilityInput,
  parseFacilityListParams,
  type FmFacilityRow,
} from "../src/modules/facilities/server/fmFacilityDomain";
import {
  resolveFinanceVerifyDatabaseUrl,
  withFinanceVerifyTransaction,
  expectSqlFailure,
  type FinanceVerifyClient,
} from "./lib/platform-finance-verify-transaction";

type CheckResult = {
  name: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  detail?: string;
};

const MIGRATION =
  "supabase/migrations/20260918190000_fm_facilities_location_foundation.sql";
const ROUTE = "src/app/api/facilities/route.ts";
const SERVICE = "src/services/facilities/FacilityService.ts";
const MASTER = "src/app/api/master-data/route.ts";
const OCCUPANT = "src/modules/occupant-requests/hooks/useOccupantFacilities.ts";
const TABLES = [
  "fm_facilities",
  "fm_buildings",
  "fm_floors",
  "fm_rooms",
  "fm_departments",
] as const;

function loadEnvLocal() {
  const path = resolve(".env.local");
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const k = t.slice(0, i).trim();
    const v = t.slice(i + 1).trim().replace(/^['"]|['"]$/g, "");
    if (!(k in process.env)) process.env[k] = v;
  }
}

function assert(cond: unknown, message: string): asserts cond {
  if (!cond) throw new Error(message);
}

function push(
  results: CheckResult[],
  name: string,
  status: CheckResult["status"],
  detail?: string
) {
  results.push({ name, status, detail });
  const suffix = detail ? ` — ${detail}` : "";
  console.log(`${status} ${name}${suffix}`);
}

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function sampleRow(overrides: Partial<FmFacilityRow> = {}): FmFacilityRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "22222222-2222-4222-8222-222222222222",
    code: "FAC-0007",
    name: "Annex",
    status: "active",
    facility_type: "office",
    location_text: "Lagos, Nigeria",
    size_sqm: null,
    description: "Notes",
    created_by_profile_id: null,
    updated_by_profile_id: null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
    ...overrides,
  };
}

function runStatic(results: CheckResult[]) {
  try {
    assert(existsSync(resolve(MIGRATION)), "migration missing");
    const sql = readSrc(MIGRATION);
    for (const table of TABLES) {
      assert(sql.includes(`create table public.${table}`), `${table} table`);
    }
    assert(!sql.includes("create table public.fm_vendors"), "no fm_vendors table");
    assert(!/insert into public\.fm_facilities/i.test(sql), "no facility seed insert");
    assert(!/values\s*\([^)]*NCC Annex/i.test(sql), "no NCC Annex seed");
    assert(!/values\s*\([^)]*FAC-0001/i.test(sql), "no FAC-0001 seed row");
    assert(sql.includes("organisation_id"), "organisation_id not org_id");
    assert(sql.includes("set_updated_at"), "reuses set_updated_at");
    assert(sql.includes("enable row level security"), "RLS enabled");
    assert(sql.includes("revoke all on table public.fm_facilities from public, anon, authenticated"), "anon/auth revoked");
    assert(sql.includes("grant all on table public.fm_facilities to service_role"), "service_role grant");
    assert(!sql.includes("is_platform_super_admin()"), "no SA bypass in FM location SQL");
    assert(sql.includes("fm_buildings_facility_fk"), "building composite FK");
    assert(sql.includes("fm_floors_building_fk"), "floor composite FK");
    assert(sql.includes("fm_rooms_floor_fk"), "room composite FK");
    assert(sql.includes("fm_departments_facility_fk"), "department facility FK");
    push(results, "A schema SQL", "PASS");

    const route = readSrc(ROUTE);
    assert(!route.includes("postToAppsScript"), "N: route no Apps Script");
    assert(!route.includes("postGatedOperationalProxy"), "N: route not Apps Script proxy");
    assert(route.includes("gateApiCapability"), "capability gate");
    assert(route.includes("FmFacilitiesServerService"), "Supabase service");
    assert(route.includes('data: null'), "failure envelope null data");
    const service = readSrc(SERVICE);
    assert(!service.includes("postToAppsScript"), "N: FacilityService no Apps Script");
    assert(!service.includes("listFacilitiesForSession"), "N: no server Apps Script bypass");
    push(results, "N no Apps Script facility call", "PASS");

    const master = readSrc(MASTER);
    assert(master.includes("FmLocationServerService"), "1D location service");
    assert(master.includes('entity === "vendors"'), "vendors stay Apps Script");
    assert(master.includes("postToAppsScript"), "vendor Apps Script path");
    assert(!master.includes("postGatedOperationalProxy"), "master-data is not the all-Apps-Script proxy");
    push(results, "master-data split (location Supabase, vendors Apps Script)", "PASS");

    const occupant = readSrc(OCCUPANT);
    assert(occupant.includes("NCC Annex") || occupant.includes("FAC-0001"), "occupant still hardcoded V1 default");
    assert(!occupant.includes("listFacilitiesForSession"), "occupant not guessing a UUID");
    push(results, "H occupant hardcoded default unchanged", "PASS");

    const mapped = mapFmFacilityRowToApi(sampleRow());
    assert(mapped.id === sampleRow().id, "UUID id");
    assert(mapped.code === "FAC-0007", "code mapped");
    assert(mapped.location === "Lagos, Nigeria", "location_text → location");
    assert(mapped.manager === "", "J manager not stored");
    assert(mapped.type === "office", "type");
    assert(mapped.description === "Notes", "description");
    push(results, "J API compatibility mapping", "PASS");

    const emptyPage = paginateRows([], 1, 8);
    assert(emptyPage.total === 0 && emptyPage.data.length === 0, "L empty total 0");
    assert(emptyPage.totalPages === 1, "L empty totalPages 1");
    const items = Array.from({ length: 10 }, (_, i) => i);
    const page2 = paginateRows(items, 2, 8);
    assert(page2.data.join(",") === "8,9" && page2.total === 10 && page2.totalPages === 2, "K page 2");
    push(results, "K pagination + L healthy empty", "PASS");

    const filtered = filterFacilityRows(
      [
        mapFmFacilityRowToApi(sampleRow({ name: "Annex", status: "active" })),
        mapFmFacilityRowToApi(
          sampleRow({
            id: "33333333-3333-4333-8333-333333333333",
            name: "Plant",
            status: "inactive",
            code: "FAC-0008",
          })
        ),
      ],
      { search: "ann", status: "active", type: "office", location: "Lagos, Nigeria" }
    );
    assert(filtered.length === 1 && filtered[0]?.name === "Annex", "search/status/type/location");
    push(results, "list filters", "PASS");

    assert(generateNextFacilityCode([]) === "FAC-0001", "first code");
    assert(generateNextFacilityCode(["FAC-0001", "FAC-0012"]) === "FAC-0013", "next code");
    parseCreateFacilityInput({
      name: "Site",
      location: "Abuja, Nigeria",
      type: "hub",
      manager: "ignored",
      status: "active",
    });
    const params = parseFacilityListParams({ page: 2, pageSize: 8, status: "all" });
    assert(params.page === 2 && params.pageSize === 8, "list params");
    push(results, "create parse + code generation", "PASS");

    const unassigned = resolveOperatingAccessFromSheetUser("sa@x.com", "SA", null);
    const saOnly = applyPlatformSuperAdmin(unassigned, true);
    assert(accessCan(saOnly, "ops.view"), "existing SA override still grants ops.view at app gate");
    const ncc = resolveOperatingAccessFromSheetUser("c@x.com", "Client", {
      id: "USR-0009",
      name: "Client",
      email: "c@x.com",
      role: "NCC / Client",
      status: "active",
      facility: "NCC Annex",
    });
    assert(!accessCan(ncc, "ops.view"), "F ncc_client cannot read facilities");
    const staff = resolveOperatingAccessFromSheetUser("s@x.com", "Staff", {
      id: "USR-0003",
      name: "Staff",
      email: "s@x.com",
      role: "FM Staff",
      status: "active",
      facility: "NCC Annex",
    });
    assert(accessCan(staff, "ops.view"), "E FM staff can read");
    assert(accessCan(staff, "ops.create") && accessCan(staff, "ops.edit"), "G staff can mutate");
    push(results, "E/F/G OperatingAccess mapping", "PASS");

    const failRoute = readSrc(ROUTE);
    assert(failRoute.includes("status: 503") || failRoute.includes("503"), "M 503 unavailable");
    assert(failRoute.includes("status: 502") || failRoute.includes("502"), "M 502 error");
    assert(failRoute.includes("success: false"), "M failure not success");
    push(results, "M failure is not empty success", "PASS");
  } catch (error) {
    push(
      results,
      "static suite",
      "FAIL",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function privilege(
  client: FinanceVerifyClient,
  grantee: string,
  table: string,
  priv: string
): Promise<boolean> {
  const res = await client.query<{ ok: boolean }>(
    `select has_table_privilege($1, $2, $3) as ok`,
    [grantee, `public.${table}`, priv]
  );
  return Boolean(res.rows[0]?.ok);
}

async function runDb(results: CheckResult[]) {
  if (!resolveFinanceVerifyDatabaseUrl()) {
    push(
      results,
      "database suite",
      "SKIPPED",
      "PLATFORM_FINANCE_VERIFY_DATABASE_URL not set"
    );
    return;
  }

  const tx = await withFinanceVerifyTransaction(async (client) => {
    for (const table of TABLES) {
      const exists = await client.query<{ ok: boolean }>(
        `select exists (
           select 1 from information_schema.tables
           where table_schema = 'public' and table_name = $1
         ) as ok`,
        [table]
      );
      assert(exists.rows[0]?.ok === true, `${table} exists`);

      const rls = await client.query<{ ok: boolean }>(
        `select c.relrowsecurity as ok
         from pg_class c
         join pg_namespace n on n.oid = c.relnamespace
         where n.nspname = 'public' and c.relname = $1`,
        [table]
      );
      assert(rls.rows[0]?.ok === true, `${table} RLS enabled`);

      const policies = await client.query(
        `select policyname from pg_policies where schemaname = 'public' and tablename = $1`,
        [table]
      );
      assert(policies.rowCount === 0, `${table} has no JWT policies (fail closed)`);

      assert(!(await privilege(client, "anon", table, "SELECT")), `${table} anon cannot select`);
      assert(
        !(await privilege(client, "authenticated", table, "SELECT")),
        `${table} authenticated cannot select`
      );
      assert(
        !(await privilege(client, "authenticated", table, "INSERT")),
        `${table} authenticated cannot insert`
      );
      assert(await privilege(client, "service_role", table, "SELECT"), `${table} service_role select`);
      assert(await privilege(client, "service_role", table, "INSERT"), `${table} service_role insert`);
    }

    const liveCount = await client.query<{ n: number }>(
      `select count(*)::int as n from public.fm_facilities`
    );
    const liveFacilities = liveCount.rows[0]?.n ?? 0;
    assert(
      liveFacilities === 0 || liveFacilities === 1,
      `unexpected fm_facilities count ${liveFacilities}`
    );
    if (liveFacilities === 1) {
      const annex = await client.query<{ code: string; name: string }>(
        `select code, name from public.fm_facilities`
      );
      assert(annex.rows[0]?.name === "NCC Annex", "live facility is NCC Annex");
      assert(annex.rows[0]?.code === "FAC-0001", "live facility code FAC-0001");
    }

    const orgA = await client.query<{ id: string }>(
      `insert into public.organisations (name, slug, status)
       values ('FM1B Org A', $1, 'active')
       returning id::text`,
      [`fm1b-a-${Date.now()}`]
    );
    const orgB = await client.query<{ id: string }>(
      `insert into public.organisations (name, slug, status)
       values ('FM1B Org B', $1, 'active')
       returning id::text`,
      [`fm1b-b-${Date.now()}`]
    );
    const a = orgA.rows[0]!.id;
    const b = orgB.rows[0]!.id;

    const facA = await client.query<{ id: string }>(
      `insert into public.fm_facilities (organisation_id, code, name, status, facility_type, location_text)
       values ($1, 'FAC-TEMP', 'Temp A', 'active', 'office', 'Lagos, Nigeria')
       returning id::text`,
      [a]
    );
    const facilityA = facA.rows[0]!.id;

    const facB = await client.query<{ id: string }>(
      `insert into public.fm_facilities (organisation_id, code, name, status)
       values ($1, 'FAC-TEMP', 'Temp B', 'active')
       returning id::text`,
      [b]
    );
    const facilityB = facB.rows[0]!.id;

    await expectSqlFailure(
      client,
      `insert into public.fm_buildings (organisation_id, facility_id, name, status)
       values ($1, $2, 'Cross', 'active')`,
      [a, facilityB]
    );

    const building = await client.query<{ id: string }>(
      `insert into public.fm_buildings (organisation_id, facility_id, name, status)
       values ($1, $2, 'Block 1', 'active')
       returning id::text`,
      [a, facilityA]
    );
    const buildingId = building.rows[0]!.id;

    const floor = await client.query<{ id: string }>(
      `insert into public.fm_floors (organisation_id, facility_id, building_id, name, status)
       values ($1, $2, $3, 'Ground', 'active')
       returning id::text`,
      [a, facilityA, buildingId]
    );
    const floorId = floor.rows[0]!.id;

    await expectSqlFailure(
      client,
      `insert into public.fm_floors (organisation_id, facility_id, building_id, name, status)
       values ($1, $2, $3, 'Bad', 'active')`,
      [a, facilityB, buildingId]
    );

    await client.query(
      `insert into public.fm_rooms (organisation_id, facility_id, building_id, floor_id, name, status)
       values ($1, $2, $3, $4, 'R1', 'active')`,
      [a, facilityA, buildingId, floorId]
    );

    await client.query(
      `insert into public.fm_departments (organisation_id, facility_id, name, status)
       values ($1, $2, 'Ops', 'active')`,
      [a, facilityA]
    );

    await expectSqlFailure(
      client,
      `insert into public.fm_departments (organisation_id, facility_id, name, status)
       values ($1, $2, 'Leak', 'active')`,
      [a, facilityB]
    );

    return { ok: true as const };
  });

  if (!tx.ok) {
    push(results, "database suite", "FAIL", tx.error);
    return;
  }
  push(results, "A tables exist", "PASS");
  push(results, "B RLS enabled", "PASS");
  push(results, "C anonymous cannot read", "PASS");
  push(results, "D/H/I tenant + hierarchy integrity", "PASS");
  push(results, "O live facilities 0 or NCC Annex once; tx rolled back", "PASS");
  push(results, "P SA/JWT have no table grants", "PASS");
  assert(tx.rolledBack, "transaction rolled back");
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  runStatic(results);
  await runDb(results);

  const failed = results.filter((r) => r.status === "FAIL");
  const skipped = results.filter((r) => r.status === "SKIPPED");
  console.log(
    `\n${results.filter((r) => r.status === "PASS").length} passed, ${failed.length} failed, ${skipped.length} skipped`
  );
  if (failed.length) {
    process.exit(1);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
