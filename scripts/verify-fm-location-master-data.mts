/**
 * FM Phase 1D — location & master-data cutover verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-location-master-data.mts
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
  type AccessCapability,
} from "../src/lib/access";
import {
  filterLocationItems,
  generateNextLocationCode,
  isCatalogVisibleStatus,
  mapFmLocationRowToApi,
  mapFmLocationRowToCatalogItem,
  paginateLocationRows,
  parseCreateLocationInput,
  parseLocationEntity,
  parseLocationListParams,
  type FmLocationRow,
} from "../src/modules/master-data/server/fmLocationDomain";

type CheckResult = {
  name: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  detail?: string;
};

const MIGRATION_1B =
  "supabase/migrations/20260918190000_fm_facilities_location_foundation.sql";
const MIGRATION_1D =
  "supabase/migrations/20260918200000_fm_location_description_and_floor_level.sql";
const ROUTE = "src/app/api/master-data/route.ts";
const FACILITIES_ROUTE = "src/app/api/facilities/route.ts";
const SERVICE = "src/services/masterData/MasterDataService.ts";
const REPO = "src/modules/master-data/server/FmLocationRepository.ts";
const SERVER = "src/modules/master-data/server/FmLocationServerService.ts";
const OCCUPANT = "src/modules/occupant-requests/hooks/useOccupantFacilities.ts";
const APPS_SCRIPT_FILES = [
  "apps-script/MasterDataService.gs",
  "apps-script/MasterDataRepository.gs",
  "apps-script/ROUTER.gs",
];

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

function sampleRow(
  entity: "buildings" | "floors" | "rooms" | "departments",
  overrides: Partial<FmLocationRow> = {}
): FmLocationRow {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    organisation_id: "22222222-2222-4222-8222-222222222222",
    facility_id: "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0",
    building_id: entity === "floors" || entity === "rooms"
      ? "44444444-4444-4444-8444-444444444444"
      : null,
    floor_id: entity === "rooms" ? "55555555-5555-4555-8555-555555555555" : null,
    name: entity === "departments" ? "Ops" : "Block 1",
    code: "BLD-0001",
    status: "active",
    description: "Notes",
    level: entity === "floors" ? "G" : null,
    created_at: "2026-09-18T00:00:00.000Z",
    updated_at: "2026-09-18T00:00:00.000Z",
    ...overrides,
  };
}

function runStatic(results: CheckResult[]) {
  try {
    assert(existsSync(resolve(MIGRATION_1B)), "1B foundation migration missing");
    assert(existsSync(resolve(MIGRATION_1D)), "1D additive migration missing");
    const sql1b = readSrc(MIGRATION_1B);
    const sql1d = readSrc(MIGRATION_1D);
    assert(sql1b.includes("create table public.fm_buildings"), "reuse fm_buildings");
    assert(sql1b.includes("create table public.fm_floors"), "reuse fm_floors");
    assert(sql1b.includes("create table public.fm_rooms"), "reuse fm_rooms");
    assert(sql1b.includes("create table public.fm_departments"), "reuse fm_departments");
    assert(!sql1b.includes("create table public.fm_vendors"), "no fm_vendors in 1B");
    assert(!sql1d.includes("create table"), "1D is additive columns only");
    assert(!/create table public\.fm_vendors/i.test(sql1d), "no fm_vendors table");
    assert(sql1d.includes("add column if not exists description"), "description columns");
    assert(sql1d.includes("add column if not exists level"), "floor level column");
    assert(!/insert into public\.fm_/i.test(sql1d), "no location seed insert");
    assert(!/NCC Annex/i.test(sql1d), "no NCC Annex seed");
    push(results, "schema reuse + additive description/level only", "PASS");

    const route = readSrc(ROUTE);
    assert(route.includes("FmLocationServerService"), "location server service");
    assert(route.includes("resolveFmFacilitiesOrganisation"), "reuses facility org resolver");
    assert(route.includes("gateApiCapability"), "capability gate");
    assert(route.includes('entity === "vendors"'), "vendor split");
    assert(route.includes("postToAppsScript"), "vendors still Apps Script");
    assert(!route.includes("postGatedOperationalProxy"), "not the monolithic proxy");
    assert(route.includes("getLocationCatalog"), "catalog on Supabase path");
    assert(route.includes("503"), "location failure is 503");
    assert(route.includes("data: null"), "failure envelope null data");
    assert(!/catch\s*\(\s*\)\s*=>\s*\[\]/.test(route), "route does not catch to []");
    push(results, "master-data split routing", "PASS");

    const server = readSrc(SERVER);
    assert(server.includes('listRows("buildings")'), "buildings from Supabase");
    assert(server.includes('listRows("floors")'), "floors from Supabase");
    assert(server.includes('listRows("rooms")'), "rooms from Supabase");
    assert(server.includes("getLocationCatalog"), "catalog assembler");
    assert(!server.includes("postToAppsScript"), "location service never calls Apps Script");
    assert(server.includes("Promise.all"), "catalog loads all location sources together");
    assert(!server.includes(".catch([]"), "catalog does not swallow to empty");
    const repo = readSrc(REPO);
    assert(repo.includes("organisation_id: this.organisationId"), "org from server authority");
    assert(!repo.includes("organisation_id: input"), "never trusts client organisation_id");
    push(results, "Supabase location repository / no dual-write", "PASS");

    const facilitiesRoute = readSrc(FACILITIES_ROUTE);
    assert(facilitiesRoute.includes("FmFacilitiesServerService"), "facilities remain Supabase");
    assert(!facilitiesRoute.includes("postToAppsScript"), "facilities still no Apps Script");
    push(results, "Facilities remain Phase 1B Supabase path", "PASS");

    const client = readSrc(SERVICE);
    assert(client.includes("/master-data"), "client still uses combined API");
    assert(client.includes("vendors"), "vendors still a client entity");
    push(results, "public API contract preserved", "PASS");

    const occupant = readSrc(OCCUPANT);
    // Phase 2C: identity is the real fm_facilities UUID; FAC-0001 is only the
    // display code read from Supabase, never a hardcoded identity.
    assert(!/["']FAC-0001["']/.test(occupant), "occupant no longer hardcodes FAC-0001");
    assert(occupant.includes("listOccupantFacilities"), "occupant facility comes from the server (Supabase) action");
    push(results, "occupant portal uses real facility UUID (Phase 2C)", "PASS");

    const options = readSrc("src/hooks/useMasterDataOptions.ts");
    assert(options.includes("setError"), "lookup hook reports load failure");
    assert(!options.includes(".catch(() =>"), "lookup hook does not swallow to [] only");
    const select = readSrc("src/components/forms/MasterDataSelect.tsx");
    assert(select.includes("Unable to load options."), "select distinguishes failed load");
    const fields = readSrc("src/components/forms/MasterLocationFields.tsx");
    assert(fields.includes("catalogFailed"), "location fields distinguish failed vs empty");
    const table = readSrc("src/modules/master-data/components/MasterDataTable.tsx");
    assert(table.includes("None configured") || table.includes("none configured") || table.includes("No ${nouns.plural} configured"), "empty collection copy");
    const form = readSrc("src/modules/master-data/components/MasterDataFormModal.tsx");
    assert(form.includes('entity === "departments"'), "department form requires facility");
    push(results, "empty vs failed UI semantics", "PASS");

    for (const file of APPS_SCRIPT_FILES) {
      assert(existsSync(resolve(file)), `${file} still present`);
    }
    push(results, "Apps Script files not required for this cutover", "PASS");

    parseLocationEntity({ entity: "buildings" });
    try {
      parseLocationEntity({ entity: "vendors" });
      throw new Error("vendors must not parse as a location entity");
    } catch (error) {
      assert(
        error instanceof Error && /vendors remain/i.test(error.message),
        "vendors rejected by location parser"
      );
    }
    const created = parseCreateLocationInput({
      entity: "buildings",
      name: "Block 1",
      facilityId: "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0",
      status: "active",
      description: "Notes",
    });
    assert(created.facilityId === "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0", "canonical facility UUID");
    try {
      parseCreateLocationInput({ entity: "departments", name: "Ops" });
      throw new Error("department without facility must fail");
    } catch (error) {
      assert(
        error instanceof Error && /facility is required/i.test(error.message),
        "department requires facility"
      );
    }
    const params = parseLocationListParams({
      entity: "floors",
      page: 2,
      pageSize: 10,
      status: "all",
    });
    assert(params.page === 2 && params.pageSize === 10, "list params");
    push(results, "create parse + vendor exclusion", "PASS");

    const mapped = mapFmLocationRowToApi("floors", sampleRow("floors"));
    assert(mapped.id === sampleRow("floors").id, "UUID id");
    assert(mapped.facilityId === "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0", "facility UUID");
    assert(mapped.buildingId === sampleRow("floors").building_id, "building parent");
    assert(mapped.level === "G", "floor level round-trip");
    assert(mapped.description === "Notes", "description round-trip");
    const catalogItem = mapFmLocationRowToCatalogItem("rooms", sampleRow("rooms"));
    assert(catalogItem.floorId === sampleRow("rooms").floor_id, "catalog room floor");
    push(results, "API compatibility mapping", "PASS");

    const emptyPage = paginateLocationRows([], 1, 10);
    assert(emptyPage.total === 0 && emptyPage.data.length === 0, "healthy empty total 0");
    assert(emptyPage.totalPages === 1, "healthy empty totalPages 1");
    assert(isCatalogVisibleStatus("active") && isCatalogVisibleStatus("pending"), "catalog includes active/pending");
    assert(!isCatalogVisibleStatus("inactive"), "catalog excludes inactive");
    const filtered = filterLocationItems(
      [
        mapFmLocationRowToApi("buildings", sampleRow("buildings", { name: "North" })),
        mapFmLocationRowToApi(
          "buildings",
          sampleRow("buildings", {
            id: "66666666-6666-4666-8666-666666666666",
            name: "South",
            status: "inactive",
            code: "BLD-0002",
          })
        ),
      ],
      { entity: "buildings", search: "nor", status: "active" }
    );
    assert(filtered.length === 1 && filtered[0]?.name === "North", "search/status filter");
    assert(generateNextLocationCode("BLD", []) === "BLD-0001", "first building code");
    assert(generateNextLocationCode("FLR", ["FLR-0001", "FLR-0004"]) === "FLR-0005", "next floor code");
    assert(generateNextLocationCode("RM", []) === "RM-0001", "first room code");
    assert(generateNextLocationCode("DEP", ["DEP-0009"]) === "DEP-0010", "next department code");
    push(results, "pagination, filters, code generation, healthy zero", "PASS");

    const unassigned = resolveOperatingAccessFromSheetUser("sa@x.com", "SA", null);
    const saOnly = applyPlatformSuperAdmin(unassigned, true);
    assert(!accessCan(saOnly, "ops.view"), "SA override does not grant ops.view");
    const ncc = resolveOperatingAccessFromSheetUser("c@x.com", "Client", {
      id: "USR-0009",
      name: "Client",
      email: "c@x.com",
      role: "NCC / Client",
      status: "active",
      facility: "NCC Annex",
    });
    assert(!accessCan(ncc, "ops.view"), "ncc_client cannot read master-data");
    const staff = {
      ...resolveOperatingAccessFromSheetUser("s@x.com", "Staff", {
        id: "USR-0003",
        name: "Staff",
        email: "s@x.com",
        role: "FM Staff",
        status: "active",
        facility: "NCC Annex",
      }),
      capabilities: ["ops.view", "ops.create", "ops.edit"] as AccessCapability[],
    };
    assert(accessCan(staff, "ops.view"), "explicit grant can read");
    assert(accessCan(staff, "ops.create") && accessCan(staff, "ops.edit"), "explicit grant can mutate");
    push(results, "existing ops.* capability gates (explicit grants; SA override narrowed)", "PASS");
  } catch (error) {
    push(
      results,
      "static suite",
      "FAIL",
      error instanceof Error ? error.message : String(error)
    );
  }
}

async function runDb(results: CheckResult[]) {
  const { resolveFinanceVerifyDatabaseUrl, withFinanceVerifyTransaction, expectSqlFailure } =
    await import("./lib/platform-finance-verify-transaction");

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
    for (const table of ["fm_buildings", "fm_floors", "fm_rooms", "fm_departments"] as const) {
      const desc = await client.query<{ ok: boolean }>(
        `select exists (
           select 1 from information_schema.columns
           where table_schema = 'public' and table_name = $1 and column_name = 'description'
         ) as ok`,
        [table]
      );
      assert(desc.rows[0]?.ok === true, `${table}.description exists`);
    }
    const level = await client.query<{ ok: boolean }>(
      `select exists (
         select 1 from information_schema.columns
         where table_schema = 'public' and table_name = 'fm_floors' and column_name = 'level'
       ) as ok`
    );
    assert(level.rows[0]?.ok === true, "fm_floors.level exists");

    const vendors = await client.query<{ ok: boolean }>(
      `select exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'fm_vendors'
       ) as ok`
    );
    assert(vendors.rows[0]?.ok === false, "fm_vendors must not exist");

    const live = await client.query<{
      facilities: number;
      buildings: number;
      floors: number;
      rooms: number;
      departments: number;
    }>(
      `select
         (select count(*)::int from public.fm_facilities) as facilities,
         (select count(*)::int from public.fm_buildings) as buildings,
         (select count(*)::int from public.fm_floors) as floors,
         (select count(*)::int from public.fm_rooms) as rooms,
         (select count(*)::int from public.fm_departments) as departments`
    );
    assert(live.rows[0]?.facilities === 1, "live fm_facilities = 1");
    assert(live.rows[0]?.buildings === 0, "live fm_buildings = 0");
    assert(live.rows[0]?.floors === 0, "live fm_floors = 0");
    assert(live.rows[0]?.rooms === 0, "live fm_rooms = 0");
    assert(live.rows[0]?.departments === 0, "live fm_departments = 0");
    const annex = await client.query<{ id: string; code: string; name: string }>(
      `select id::text, code, name from public.fm_facilities`
    );
    assert(annex.rowCount === 1, "NCC Annex exactly once");
    assert(annex.rows[0]?.name === "NCC Annex", "name NCC Annex");
    assert(annex.rows[0]?.code === "FAC-0001", "code FAC-0001");
    assert(
      annex.rows[0]?.id === "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0",
      "canonical facility UUID"
    );

    for (const table of ["fm_buildings", "fm_floors", "fm_rooms", "fm_departments"] as const) {
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
      assert(policies.rowCount === 0, `${table} has no JWT policies`);
      const anon = await client.query<{ ok: boolean }>(
        `select has_table_privilege('anon', $1, 'SELECT') as ok`,
        [`public.${table}`]
      );
      assert(anon.rows[0]?.ok === false, `${table} anon cannot select`);
      const auth = await client.query<{ ok: boolean }>(
        `select has_table_privilege('authenticated', $1, 'SELECT') as ok`,
        [`public.${table}`]
      );
      assert(auth.rows[0]?.ok === false, `${table} authenticated cannot select`);
    }

    const orgA = await client.query<{ id: string }>(
      `insert into public.organisations (name, slug, status)
       values ('FM1D Org A', $1, 'active')
       returning id::text`,
      [`fm1d-a-${Date.now()}`]
    );
    const orgB = await client.query<{ id: string }>(
      `insert into public.organisations (name, slug, status)
       values ('FM1D Org B', $1, 'active')
       returning id::text`,
      [`fm1d-b-${Date.now()}`]
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
      `insert into public.fm_buildings (organisation_id, facility_id, name, status, description)
       values ($1, $2, 'Cross', 'active', 'no')`,
      [a, facilityB]
    );

    const building = await client.query<{ id: string }>(
      `insert into public.fm_buildings (organisation_id, facility_id, name, status, description)
       values ($1, $2, 'Block 1', 'active', 'probe')
       returning id::text`,
      [a, facilityA]
    );
    const buildingId = building.rows[0]!.id;

    const floor = await client.query<{ id: string }>(
      `insert into public.fm_floors (organisation_id, facility_id, building_id, name, status, level, description)
       values ($1, $2, $3, 'Ground', 'active', 'G', 'probe')
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
      `insert into public.fm_rooms (organisation_id, facility_id, building_id, floor_id, name, status, description)
       values ($1, $2, $3, $4, 'R1', 'active', 'probe')`,
      [a, facilityA, buildingId, floorId]
    );

    await client.query(
      `insert into public.fm_departments (organisation_id, facility_id, name, status, description)
       values ($1, $2, 'Ops', 'active', 'probe')`,
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
  push(results, "description/level columns exist", "PASS");
  push(results, "no fm_vendors table", "PASS");
  push(results, "live counts 1/0/0/0/0 NCC Annex once", "PASS");
  push(results, "RLS fail-closed + tenant/hierarchy integrity", "PASS");
  assert(tx.rolledBack, "transaction rolled back");
  push(results, "probe rows rolled back", "PASS");
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
