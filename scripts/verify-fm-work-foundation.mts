/**
 * FM Phase 2B — Work foundation & Maintenance cutover verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-fm-work-foundation.mts
 *
 * Static always. Database suite requires PLATFORM_FINANCE_VERIFY_DATABASE_URL
 * (transactional ROLLBACK — no persistent business rows).
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  filterWorkRows,
  generateNextWorkCode,
  mapFmWorkRowToMaintenance,
  parseCreateWorkInput,
  summarizeWorkOperationalPicture,
  type FmWorkRow,
} from "../src/modules/maintenance/server/fmWorkDomain";
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

const MIGRATION = "supabase/migrations/20260918220000_fm_work.sql";
const ROUTE = "src/app/api/maintenance/route.ts";
const SERVICE = "src/services/maintenance/MaintenanceService.ts";
const REQUEST_TREATMENT =
  "src/lib/operational/orchestration/requestTreatment.ts";
const WO_ORCH = "src/lib/operational/orchestration/index.ts";
const CC = "src/services/workspace/CommandCentreFmSummaryService.ts";
const PEOPLE = "src/modules/users/server/FmPeopleServerService.ts";

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

function sampleRow(overrides: Partial<FmWorkRow> = {}): FmWorkRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    organisation_id: "22222222-2222-4222-8222-222222222222",
    code: "WRK-2026-000001",
    facility_id: "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0",
    title: "Replace filter",
    description: null,
    work_kind: null,
    source: "manual",
    priority: "high",
    status: "requested",
    asset_ref: null,
    source_request_ref: null,
    incident_ref: null,
    assigned_to_profile_id: null,
    reported_by_profile_id: null,
    hold_reason: null,
    requires_work_instruction: false,
    operational_event_id: null,
    reported_at: "2026-09-18T00:00:00.000Z",
    due_at: null,
    scheduled_start_at: null,
    scheduled_end_at: null,
    started_at: null,
    completed_at: null,
    completion_notes: null,
    category_id: null,
    department: null,
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
    assert(sql.includes("create table public.fm_work"), "fm_work table");
    assert(!/create table public\.fm_maintenance/i.test(sql), "no fm_maintenance");
    assert(!/insert into public\.fm_work/i.test(sql), "no work seed");
    assert(sql.includes("assigned_to_profile_id"), "profile assignee");
    assert(sql.includes("requires_work_instruction"), "requires flag");
    assert(sql.includes("enable row level security"), "RLS");
    assert(
      sql.includes(
        "revoke all on table public.fm_work from public, anon, authenticated"
      ),
      "anon/auth revoked"
    );
    assert(sql.includes("grant all on table public.fm_work to service_role"), "service_role");
    assert(!sql.includes("is_platform_super_admin()"), "no SA bypass");
    assert(sql.includes("source_request_ref"), "transitional request ref");
    assert(!sql.includes("work_order_ids"), "no child id arrays");
    push(results, "migration shape", "PASS");
  } catch (error) {
    push(
      results,
      "migration shape",
      "FAIL",
      error instanceof Error ? error.message : String(error)
    );
  }

  try {
    const route = readSrc(ROUTE);
    assert(route.includes("FmWorkServerService"), "route uses FmWork");
    assert(!route.includes("postGatedOperationalProxy"), "no Apps Script proxy");
    assert(!route.includes("postToAppsScript"), "no Apps Script post");
    const service = readSrc(SERVICE);
    assert(service.includes("apiClient"), "browser service uses apiClient");
    assert(
      !service.includes("getFmWorkServerService"),
      "browser MaintenanceService must not import server Work modules"
    );
    assert(!service.includes("postToAppsScript"), "MaintenanceService no GAS");
    assert(
      existsSync(
        resolve("src/modules/maintenance/server/MaintenanceServerAccess.ts")
      ),
      "server access facade missing"
    );
    push(results, "API cutover", "PASS");
  } catch (error) {
    push(
      results,
      "API cutover",
      "FAIL",
      error instanceof Error ? error.message : String(error)
    );
  }

  try {
    const treatment = readSrc(REQUEST_TREATMENT);
    assert(
      treatment.includes("Phase 2B: Work is Supabase SoT"),
      "Request→Work uses Supabase path"
    );
    assert(
      treatment.includes("MaintenanceService.createMaintenance"),
      "creates Work via service"
    );
    assert(
      treatment.includes("RequestService.updateRequest"),
      "links Request sheet only"
    );
    const orch = readSrc(WO_ORCH);
    assert(
      !orch.includes("WorkOrderService.createWorkOrderFromMaintenance"),
      "no GAS createFromMaintenance"
    );
    assert(
      orch.includes("WorkOrderService.createWorkOrder"),
      "WO create via standard path"
    );
    push(results, "hidden writers rerouted", "PASS");
  } catch (error) {
    push(
      results,
      "hidden writers rerouted",
      "FAIL",
      error instanceof Error ? error.message : String(error)
    );
  }

  try {
    const cc = readSrc(CC);
    assert(cc.includes("MaintenanceServerAccess"), "CC Work from Supabase");
    assert(cc.includes("Replace Apps Script Maintenance"), "CC replaces MNT");
    const people = readSrc(PEOPLE);
    assert(people.includes("FmWorkRepository"), "people workload from fm_work");
    push(results, "derived consumers", "PASS");
  } catch (error) {
    push(
      results,
      "derived consumers",
      "FAIL",
      error instanceof Error ? error.message : String(error)
    );
  }

  try {
    const code = generateNextWorkCode(["WRK-2026-000003", "WRK-2025-000099"]);
    assert(code.startsWith("WRK-"), `code prefix ${code}`);
    assert(/WRK-\d{4}-\d{6}/.test(code), `code shape ${code}`);

    const mapped = mapFmWorkRowToMaintenance(sampleRow());
    assert(mapped.id === "WRK-2026-000001", "display id is code");
    assert(mapped.workOrderIds?.length === 0, "no stored WO ids");
    assert(mapped.type === "corrective", "null kind adapter default");

    const input = parseCreateWorkInput({
      title: "Test",
      facilityId: "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0",
      priority: "medium",
      status: "requested",
      source: "manual",
      reportedAt: "2026-09-18T00:00:00.000Z",
    });
    assert(input.workKind === null, "no invented work_kind");

    const stripped = parseCreateWorkInput({
      title: "Test",
      facilityId: "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0",
      priority: "medium",
      status: "requested",
      source: "manual",
      reportedAt: "2026-09-18T00:00:00.000Z",
      assignedToUserId: "USR-0001",
    });
    assert(
      stripped.assignedToProfileId === undefined,
      "USR assignee stripped not stored"
    );

    let rejected = false;
    try {
      parseCreateWorkInput({
        title: "Test",
        facilityId: "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0",
        priority: "medium",
        status: "requested",
        source: "manual",
        reportedAt: "2026-09-18T00:00:00.000Z",
        assignedToUserId: "not-a-uuid",
      });
    } catch {
      rejected = true;
    }
    assert(rejected, "non-UUID assignee rejected");

    const picture = summarizeWorkOperationalPicture(
      [
        mapFmWorkRowToMaintenance(
          sampleRow({ priority: "critical", status: "in_progress" })
        ),
      ],
      "2026-09-18T12:00:00.000Z"
    );
    assert(picture.critical === 1, "OP critical");
    assert(picture.inProgress === 1, "OP in progress");

    const filtered = filterWorkRows(
      [mapFmWorkRowToMaintenance(sampleRow({ status: "completed" }))],
      { status: "active" }
    );
    assert(filtered.length === 0, "active filter excludes completed");

    push(results, "domain helpers", "PASS");
  } catch (error) {
    push(
      results,
      "domain helpers",
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

async function runDatabase(results: CheckResult[]) {
  const url = resolveFinanceVerifyDatabaseUrl();
  if (!url) {
    push(
      results,
      "database suite",
      "SKIPPED",
      "PLATFORM_FINANCE_VERIFY_DATABASE_URL not set"
    );
    return;
  }

  const outcome = await withFinanceVerifyTransaction(async (client) => {
    const table = await client.query<{ exists: boolean }>(
      `select to_regclass('public.fm_work') is not null as exists`
    );
    assert(table.rows[0]?.exists, "fm_work missing — apply migration first");

    const count = await client.query<{ n: string }>(
      `select count(*)::text as n from public.fm_work`
    );
    assert(count.rows[0]?.n === "0", `fm_work not empty: ${count.rows[0]?.n}`);

    const rls = await client.query<{ rls: boolean }>(
      `select relrowsecurity as rls from pg_class where oid = 'public.fm_work'::regclass`
    );
    assert(rls.rows[0]?.rls === true, "RLS not enabled");

    assert(
      !(await privilege(client, "anon", "fm_work", "SELECT")),
      "anon SELECT"
    );
    assert(
      !(await privilege(client, "authenticated", "fm_work", "SELECT")),
      "authenticated SELECT"
    );
    assert(
      await privilege(client, "service_role", "fm_work", "SELECT"),
      "service_role SELECT"
    );

    const org = await client.query<{ id: string }>(
      `select organisation_id as id from public.fm_facilities where id = $1`,
      ["e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0"]
    );
    const organisationId = org.rows[0]?.id;
    assert(organisationId, "NCC Annex facility missing");

    const profile = await client.query<{ id: string }>(
      `select id from public.profiles where organisation_id = $1 limit 1`,
      [organisationId]
    );
    const profileId = profile.rows[0]?.id;
    assert(profileId, "profile missing");

    await client.query(`savepoint work_ok`);
    await client.query(
      `insert into public.fm_work (
        organisation_id, code, facility_id, title, source, priority, status,
        created_by_profile_id, updated_by_profile_id
      ) values ($1, 'WRK-2099-999999', $2, 'Probe Work', 'manual', 'medium', 'requested', $3, $3)`,
      [organisationId, "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0", profileId]
    );
    await client.query(`rollback to savepoint work_ok`);

    await expectSqlFailure(client,
        `insert into public.fm_work (
          organisation_id, code, facility_id, title, source, priority, status
        ) values ($1, 'WRK-2099-888888', '00000000-0000-4000-8000-000000000099', 'Bad facility', 'manual', 'medium', 'requested')`,
        [organisationId]);

    await expectSqlFailure(client,
        `insert into public.fm_work (
          organisation_id, code, facility_id, title, source, priority, status,
          assigned_to_profile_id
        ) values ($1, 'WRK-2099-777777', $2, 'Bad assignee', 'manual', 'medium', 'requested',
          '00000000-0000-4000-8000-000000000098')`,
        [organisationId, "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0"]);

    await expectSqlFailure(client,
        `insert into public.fm_work (
          organisation_id, code, facility_id, title, source, priority, status
        ) values ($1, 'WRK-2099-666666', $2, 'Bad status', 'manual', 'medium', 'open')`,
        [organisationId, "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0"]);

    await expectSqlFailure(client,
        `insert into public.fm_work (
          organisation_id, code, facility_id, title, source, priority, status
        ) values ($1, 'WRK-2099-555555', $2, 'Completed no ts', 'manual', 'medium', 'completed')`,
        [organisationId, "e1a5f579-8bb1-42fb-9fdf-56faaaa1e9e0"]);

    const after = await client.query<{ n: string }>(
      `select count(*)::text as n from public.fm_work`
    );
    assert(after.rows[0]?.n === "0", "probe rows leaked");

    return true;
  });

  if (!outcome.ok) {
    push(results, "database suite", "FAIL", outcome.error);
    return;
  }
  push(results, "database suite", "PASS", "rollback probes clean");
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  runStatic(results);
  await runDatabase(results);

  const failed = results.filter((r) => r.status === "FAIL");
  const skipped = results.filter((r) => r.status === "SKIPPED");
  console.log(
    `\nPhase 2B verify: ${results.length - failed.length - skipped.length} PASS, ${failed.length} FAIL, ${skipped.length} SKIPPED`
  );
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
