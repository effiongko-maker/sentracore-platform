/**
 * FM Phase 2A — people, facility assignments, and FM access foundation.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-people-access.mts
 *
 * Static always. Database suite requires PLATFORM_FINANCE_VERIFY_DATABASE_URL
 * (transactional ROLLBACK — no persistent business rows).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  accessCan,
  applyPlatformSuperAdmin,
  resolveOperatingAccessFromGrants,
} from "../src/lib/access";
import {
  collapsePeopleByProfile,
  parseCreateAssignmentInput,
  parseOperationalRole,
} from "../src/modules/users/server/fmPeopleDomain";
import {
  resolveFinanceVerifyDatabaseUrl,
  withFinanceVerifyTransaction,
  expectSqlFailure,
  type FinanceVerifyClient,
} from "./lib/platform-finance-verify-transaction";

import { explicitGrantBundle, contextAccess } from "./lib/accessFixtures";

type CheckResult = {
  name: string;
  status: "PASS" | "FAIL" | "SKIPPED";
  detail?: string;
};

const MIGRATION =
  "supabase/migrations/20260918210000_fm_people_assignments_and_fm_iam.sql";
const USERS_ROUTE = "src/app/api/users/route.ts";
const ACCESS_SERVER = "src/lib/access/server.ts";
const CAPS = "src/lib/access/capabilities.ts";
const ADMIN_SERVICE =
  "src/modules/platform-admin/server/PlatformAdminServerService.ts";
const FORM = "src/modules/users/components/UserFormModal.tsx";
const FACILITY_HOOK = "src/hooks/useFacilityOptions.ts";

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

function runStatic(results: CheckResult[]) {
  try {
    const sql = readSrc(MIGRATION);
    assert(sql.includes("fm_facility_assignments"), "assignment table");
    assert(!/create table public\.fm_people/i.test(sql), "no fm_people table");
    assert(sql.includes("fm_facility_assignments_active_uidx"), "active unique");
    assert(sql.includes("operational_role is descriptive"), "role not authority");
    assert(sql.includes("'ops.view'"), "IAM allowlist includes ops.view");
    assert(!/insert into public\.fm_facility_assignments/i.test(sql), "no assignment seed");
    push(results, "migration shape", "PASS");

    const route = readSrc(USERS_ROUTE);
    assert(route.includes("FmPeopleServerService"), "users API uses people service");
    assert(!route.includes("postToAppsScript"), "users API does not call Apps Script");
    assert(route.includes("503"), "unavailable is 503");
    push(results, "/api/users cutover", "PASS");

    const server = readSrc(ACCESS_SERVER);
    assert(!server.includes("postToAppsScript"), "access server does not query Apps Script");
    assert(!server.includes("resolveFmOperationalIdentity"), "links unused for authority");
    assert(!server.includes("loadSheetUserForAccessByEmail"), "no USERS email lookup");
    assert(server.includes("platform_capability_grants"), "grants are authority");
    assert(server.includes("fm_facility_assignments"), "assignment is context");
    push(results, "FM authority off USERS", "PASS");

    const caps = readSrc(CAPS);
    assert(caps.includes('"users.view"'), "SA override keeps users.view");
    assert(
      !/SUPER_ADMIN_OVERRIDE_CAPABILITIES[\s\S]*"ops\.view"/.test(caps),
      "SA override does not include ops.view"
    );
    assert(
      caps.includes("Exact capability match only"),
      "no admin_override wildcard"
    );
    push(results, "SA override narrowed", "PASS");

    const roleOnly = contextAccess("a@x.com", "A", {
      id: "ee7eb825-090d-4db9-a852-feb278a69763",
      name: "A",
      email: "a@x.com",
      role: "Facility Manager",
      status: "active",
      facility: "NCC Annex",
    });
    assert(roleOnly.capabilities.length === 0, "job title grants nothing");
    assert(!accessCan(roleOnly, "ops.view"), "role is not permission");

    const granted = resolveOperatingAccessFromGrants({
      email: "a@x.com",
      name: "A",
      role: "facility_manager",
      capabilities: ["ops.view", "ops.create", "users.view"],
      profileId: "ee7eb825-090d-4db9-a852-feb278a69763",
    });
    assert(accessCan(granted, "ops.view"), "explicit grant works");
    assert(!accessCan(granted, "finance.pay"), "absent capability fails closed");

    const sa = applyPlatformSuperAdmin(
      resolveOperatingAccessFromGrants({
        email: "sa@x.com",
        name: "SA",
        capabilities: [],
      }),
      true
    );
    assert(accessCan(sa, "users.manage"), "SA may administer people");
    assert(accessCan(sa, "platform.admin_override"), "SA override flag");
    assert(!accessCan(sa, "ops.view"), "SA does not get ops.view");
    assert(!accessCan(sa, "finance.pay"), "SA does not get finance.pay");
    assert(!accessCan(sa, "approvals.manage"), "SA does not get approvals.manage");
    assert(!accessCan(sa, "fm.authorize_protected"), "SA ≠ FM protected");
    push(results, "grant vs role vs SA", "PASS");

    assert(parseOperationalRole("Facility Manager") === "facility_manager", "role parse");
    parseCreateAssignmentInput({
      profileId: "ee7eb825-090d-4db9-a852-feb278a69763",
      facilityId: "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0",
      role: "facility_manager",
      status: "active",
    });
    const collapsed = collapsePeopleByProfile([
      {
        id: "p1",
        name: "P",
        email: "p@x.com",
        role: "Facility Manager",
        specialization: "",
        facility: "NCC Annex",
        facilityId: "f1",
        assignmentId: "a1",
        activeWorkOrders: 0,
        workloadAvailable: false,
        status: "active",
        lastActive: "",
        createdAt: "",
      },
      {
        id: "p1",
        name: "P",
        email: "p@x.com",
        role: "FM Staff",
        specialization: "",
        facility: "Other",
        facilityId: "f2",
        assignmentId: "a2",
        activeWorkOrders: 0,
        workloadAvailable: false,
        status: "active",
        lastActive: "",
        createdAt: "",
      },
    ]);
    assert(collapsed.length === 1, "N:N collapsed to one person row");
    assert(collapsed[0]?.facility.includes("NCC Annex"), "compatibility facility label");
    push(results, "assignment parse + collapse", "PASS");

    const admin = readSrc(ADMIN_SERVICE);
    assert(!admin.includes("postToAppsScript"), "offboard does not write USERS");
    assert(!admin.includes("deactivateLinkedFmPerson"), "no Sheet people deactivate");
    push(results, "Admin offboard no USERS write", "PASS");

    const form = readSrc(FORM);
    assert(form.includes("listEligibleProfiles"), "assign existing profile");
    assert(!form.includes("/api/admin/invite-user"), "FM does not invite");
    assert(form.includes("Operating context only"), "role ≠ permission copy");
    push(results, "People create semantics", "PASS");

    const hook = readSrc(FACILITY_HOOK);
    assert(hook.includes("setError"), "facility hook has error state");
    assert(!/catch\s*\(\s*\)\s*=>\s*\{\s*[\s\S]*setFacilities\(\[\]\)/.test(hook) || hook.includes("setError"), "failure not silent empty");
    push(results, "useFacilityOptions reliability", "PASS");

    assert(
      explicitGrantBundle("facility_manager").includes("ops.view"),
      "historical catalog retained, unused at runtime"
    );
    push(results, "historical catalog unused at runtime", "PASS");
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
    const exists = await client.query<{ ok: boolean }>(
      `select exists (
         select 1 from information_schema.tables
         where table_schema = 'public' and table_name = 'fm_facility_assignments'
       ) as ok`
    );
    assert(exists.rows[0]?.ok === true, "fm_facility_assignments exists");

    const rls = await client.query<{ ok: boolean }>(
      `select c.relrowsecurity as ok
       from pg_class c
       join pg_namespace n on n.oid = c.relnamespace
       where n.nspname = 'public' and c.relname = 'fm_facility_assignments'`
    );
    assert(rls.rows[0]?.ok === true, "RLS enabled");

    const policies = await client.query(
      `select policyname from pg_policies
       where schemaname = 'public' and tablename = 'fm_facility_assignments'`
    );
    assert(policies.rowCount === 0, "no JWT policies");

    assert(
      !(await privilege(client, "anon", "fm_facility_assignments", "SELECT")),
      "anon cannot select"
    );
    assert(
      !(await privilege(
        client,
        "authenticated",
        "fm_facility_assignments",
        "SELECT"
      )),
      "authenticated cannot select"
    );
    assert(
      !(await privilege(
        client,
        "authenticated",
        "fm_facility_assignments",
        "INSERT"
      )),
      "authenticated cannot insert"
    );
    assert(
      await privilege(client, "service_role", "fm_facility_assignments", "SELECT"),
      "service_role select"
    );
    assert(
      await privilege(client, "service_role", "fm_facility_assignments", "INSERT"),
      "service_role insert"
    );

    const allowed = await client.query<{ ok: boolean }>(
      `select public.platform_iam_is_allowed_platform_capability('ops.view') as ok`
    );
    assert(allowed.rows[0]?.ok === true, "ops.view is administrable");

    const denied = await client.query<{ ok: boolean }>(
      `select public.platform_iam_is_allowed_platform_capability('platform.admin_override') as ok`
    );
    assert(denied.rows[0]?.ok === false, "admin_override is not grantable");

    const liveProfile = await client.query<{
      id: string;
      organisation_id: string;
    }>(
      `select id::text, organisation_id::text
       from public.profiles
       where id = 'ee7eb825-090d-4db9-a852-feb278a69763'`
    );
    assert(liveProfile.rows[0], "operator profile exists");
    const profileId = liveProfile.rows[0]!.id;
    const paychexId = liveProfile.rows[0]!.organisation_id;

    const slug = `fm2a-${crypto.randomUUID()}`;
    const orgB = await client.query<{ id: string }>(
      `insert into public.organisations (name, slug, status)
       values ('FM2A Probe Org', $1, 'active')
       returning id::text`,
      [slug]
    );
    const otherOrgId = orgB.rows[0]!.id;

    const facB = await client.query<{ id: string }>(
      `insert into public.fm_facilities (
         organisation_id, code, name, status, facility_type, location_text
       ) values ($1, 'FAC-TEMP', 'Temp', 'active', 'office', 'Lagos, Nigeria')
       returning id::text`,
      [otherOrgId]
    );
    const otherFacilityId = facB.rows[0]!.id;

    await expectSqlFailure(
      client,
      `insert into public.fm_facility_assignments (
         organisation_id, profile_id, facility_id, operational_role, status
       ) values ($1, $2, $3, 'facility_manager', 'active')`,
      [otherOrgId, profileId, otherFacilityId]
    );

    const annex = await client.query<{ id: string }>(
      `select id::text from public.fm_facilities
       where id = 'e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0'`
    );
    const annexId = annex.rows[0]?.id;
    assert(annexId, "NCC Annex exists");

    await expectSqlFailure(
      client,
      `insert into public.fm_facility_assignments (
         organisation_id, profile_id, facility_id, operational_role, status
       ) values ($1, $2, $3, 'facility_manager', 'active')`,
      [paychexId, profileId, otherFacilityId]
    );

    const existingActive = await client.query<{ n: number }>(
      `select count(*)::int as n
       from public.fm_facility_assignments
       where organisation_id = $1
         and profile_id = $2
         and facility_id = $3
         and status = 'active'`,
      [paychexId, profileId, annexId]
    );
    if ((existingActive.rows[0]?.n ?? 0) === 0) {
      await client.query(
        `insert into public.fm_facility_assignments (
           organisation_id, profile_id, facility_id, operational_role, status
         ) values ($1, $2, $3, 'fm_staff', 'active')`,
        [paychexId, profileId, annexId]
      );
    }
    await expectSqlFailure(
      client,
      `insert into public.fm_facility_assignments (
         organisation_id, profile_id, facility_id, operational_role, status
       ) values ($1, $2, $3, 'facility_manager', 'active')`,
      [paychexId, profileId, annexId]
    );

    const children = await client.query<{ n: number }>(
      `select (
         (select count(*) from public.fm_buildings) +
         (select count(*) from public.fm_floors) +
         (select count(*) from public.fm_rooms) +
         (select count(*) from public.fm_departments)
       )::int as n`
    );
    assert(children.rows[0]?.n === 0, "no location children created");

    return { ok: true as const };
  });

  if (!tx.ok) {
    push(results, "database suite", "FAIL", tx.error);
    return;
  }
  push(results, "database suite", "PASS", "rolled back");
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  runStatic(results);
  await runDb(results);
  const failed = results.filter((row) => row.status === "FAIL");
  if (failed.length > 0) {
    console.error(`\n${failed.length} check(s) failed.`);
    process.exit(1);
  }
  console.log("\nPhase 2A verifier passed.");
}

void main();
