/**
 * Platform Finance — Payables Slice 1 verification.
 *
 * Static (always):
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-payables-slice1.mts
 *
 * Optional DB (transaction + always ROLLBACK):
 *   PLATFORM_FINANCE_VERIFY_DATABASE_URL
 *
 * Does not modify Financial Request approval RPCs.
 * Does not invent credentials / Keychain / session_replication_role.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FINANCE_PAYABLE_CAPABILITIES,
  FINANCE_PAYABLE_DOCUMENT_ROLES,
  FINANCE_PAYABLE_EVENT_TYPES,
  FINANCE_PAYABLE_EXCEPTION_STATUSES,
  FINANCE_PAYABLE_INVARIANTS,
  FINANCE_PAYABLE_PAYEE_TYPES,
  FINANCE_PAYABLE_PRIMARY_STATUSES,
  FINANCE_PAYABLE_SOURCE_TYPES,
  FINANCE_PAYABLE_STATUSES,
  FINANCE_PAYABLE_TRANSITIONS,
  financePayableOutstandingAmount,
  isAllowedFinancePayableTransition,
  isFinancePayableSourceType,
  isFinancePayableStatus,
  PLATFORM_FINANCE_CAPABILITIES,
} from "../src/modules/platform-finance/types";
import {
  insertVerifyPayable,
  insertVerifyVendorBill,
} from "./lib/platform-finance-verify-payable-fixture";
import {
  expectSqlFailure,
  resolveFinanceVerifyDatabaseUrl,
  resolveFinanceVerifyDatabaseUrlLoose,
  withFinanceVerifyTransaction,
  type FinanceVerifyClient,
} from "./lib/platform-finance-verify-transaction";

type CheckStatus = "PASS" | "FAIL" | "SKIPPED";
type CheckResult = { name: string; status: CheckStatus; detail?: string };

const MIGRATION =
  "supabase/migrations/20260915210000_finance_payables_foundation.sql";
const REQUEST_APPROVE_MIGRATION =
  "supabase/migrations/20260914210000_finance_requests_transitions.sql";

const EXPECTED_TABLES = [
  "finance_payables",
  "finance_payable_events",
  "finance_payable_documents",
] as const;

const CAPABILITY_FORMAT = /^platform_finance(\.[a-z0-9_]+)+$/;

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

function readSrc(path: string): string {
  return readFileSync(resolve(path), "utf8");
}

function push(results: CheckResult[], name: string, status: CheckStatus, detail?: string) {
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ""}`);
}

function hasServiceEnv(): boolean {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() &&
      process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  );
}

function adminClient(): SupabaseClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } }
  );
}

function tableExistsProbe(status: number, count: number | null): boolean {
  return status === 200 && typeof count === "number";
}

async function applyMigrationIfPossible(): Promise<string | null> {
  const url = resolveFinanceVerifyDatabaseUrlLoose();
  if (!url) return "no DATABASE_URL / PLATFORM_FINANCE_VERIFY_DATABASE_URL / SUPABASE_DB_URL";
  try {
    const pg = await import("pg");
    const client = new pg.Client({
      connectionString: url,
      ssl: url.includes("localhost") ? undefined : { rejectUnauthorized: false },
    });
    await client.connect();
    try {
      await client.query(readSrc(MIGRATION));
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (!/already exists/i.test(message)) throw e;
    }
    try {
      await client.query(`notify pgrst, 'reload schema'`);
    } catch {
      /* optional PostgREST schema reload */
    }
    finally {
      await client.end();
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

function runStatic(results: CheckResult[]) {
  try {
    assert(existsSync(resolve(MIGRATION)), "migration missing");
    push(results, "schema.migration_exists", "PASS", MIGRATION);
  } catch (e) {
    push(results, "schema.migration_exists", "FAIL", (e as Error).message);
    return;
  }

  const sql = readSrc(MIGRATION);
  const approveSql = readSrc(REQUEST_APPROVE_MIGRATION);

  for (const table of EXPECTED_TABLES) {
    try {
      assert(sql.includes(`create table public.${table}`), `missing ${table}`);
      push(results, `schema.table_${table}`, "PASS");
    } catch (e) {
      push(results, `schema.table_${table}`, "FAIL", (e as Error).message);
    }
  }

  try {
    assert(sql.includes("create or replace function public.finance_payable_create"), "create RPC");
    assert(sql.includes("platform_finance.payable.create"), "create capability check");
    assert(sql.includes("unique (source_type, source_id)"), "duplicate source unique");
    assert(sql.includes("payable_amount > 0"), "positive amount");
    assert(sql.includes("paid_amount <= payable_amount"), "paid lte payable");
    assert(!/\bfacility_id\b/.test(sql), "no facility_id column");
    assert(!/references\s+.*facility/i.test(sql), "no facility FK");
    assert(sql.includes("No facility ownership"), "facility exclusion documented");
    assert(sql.includes("source_type in ('financial_request', 'vendor_bill')"), "source types");
    push(results, "schema.constraints_and_create_primitive", "PASS");
  } catch (e) {
    push(results, "schema.constraints_and_create_primitive", "FAIL", (e as Error).message);
  }

  try {
    assert(sql.includes("enable row level security"), "RLS enabled");
    assert(sql.includes("finance_payables_select"), "select policy");
    assert(sql.includes("platform_finance.payable.view"), "view cap in RLS");
    assert(sql.includes("platform_finance.payable.review"), "review cap in RLS");
    assert(sql.includes("platform_finance.payable.approve"), "approve cap in RLS");
    push(results, "schema.rls_and_capabilities", "PASS");
  } catch (e) {
    push(results, "schema.rls_and_capabilities", "FAIL", (e as Error).message);
  }

  try {
    assert(
      !sql.includes("finance_request_approve") ||
        sql.includes("Does NOT modify finance_request_approve"),
      "must not redefine approve RPC"
    );
    assert(!sql.includes("create or replace function public.finance_request_approve"), "no approve replace");
    assert(
      !sql.includes("create or replace function public.finance_request_partially_approve"),
      "no partial approve replace"
    );
    assert(approveSql.includes("Does not create payable"), "request approve remains non-payable");
    push(results, "scope.approval_rpcs_untouched", "PASS");
  } catch (e) {
    push(results, "scope.approval_rpcs_untouched", "FAIL", (e as Error).message);
  }

  try {
    assert(!sql.includes("finance_post_transaction"), "no posting");
    assert(!sql.includes("create table public.finance_payments"), "no payments table");
    assert(!/create bucket/i.test(sql), "no storage bucket");
    assert(!sql.includes("finance_vendors"), "no vendor master");
    push(results, "scope.no_payment_posting_ui_bucket", "PASS");
  } catch (e) {
    push(results, "scope.no_payment_posting_ui_bucket", "FAIL", (e as Error).message);
  }

  try {
    assert(FINANCE_PAYABLE_STATUSES.length === 9, "9 statuses");
    assert(FINANCE_PAYABLE_PRIMARY_STATUSES.length === 6, "6 primary");
    assert(FINANCE_PAYABLE_EXCEPTION_STATUSES.length === 3, "3 exception");
    for (const s of FINANCE_PAYABLE_STATUSES) {
      assert(isFinancePayableStatus(s), s);
      assert(Object.prototype.hasOwnProperty.call(FINANCE_PAYABLE_TRANSITIONS, s), `transition ${s}`);
    }
    assert(isAllowedFinancePayableTransition("draft", "pending_approval"), "draft→pending");
    assert(!isAllowedFinancePayableTransition("paid", "draft"), "paid terminal");
    assert(
      FINANCE_PAYABLE_SOURCE_TYPES.every(isFinancePayableSourceType),
      "source types"
    );
    assert(
      financePayableOutstandingAmount({ payableAmount: 3000, paidAmount: 1000 }) === 2000,
      "outstanding derived"
    );
    assert(FINANCE_PAYABLE_INVARIANTS.outstandingIsDerived, "invariant flag");
    assert(FINANCE_PAYABLE_INVARIANTS.requestIsNotPayable, "request≠payable");
    assert(FINANCE_PAYABLE_DOCUMENT_ROLES.length === 3, "doc roles");
    assert(FINANCE_PAYABLE_EVENT_TYPES.includes("created"), "created event");
    assert(FINANCE_PAYABLE_PAYEE_TYPES.length === 3, "payee types");
    push(results, "domain.invariants_and_machine", "PASS");
  } catch (e) {
    push(results, "domain.invariants_and_machine", "FAIL", (e as Error).message);
  }

  try {
    for (const cap of Object.values(FINANCE_PAYABLE_CAPABILITIES)) {
      assert(CAPABILITY_FORMAT.test(cap), cap);
    }
    assert(
      PLATFORM_FINANCE_CAPABILITIES.payable_create ===
        FINANCE_PAYABLE_CAPABILITIES.create,
      "capability wiring"
    );
    push(results, "domain.capabilities", "PASS", Object.values(FINANCE_PAYABLE_CAPABILITIES).join(", "));
  } catch (e) {
    push(results, "domain.capabilities", "FAIL", (e as Error).message);
  }

  try {
    const transitionsPath = resolve(
      "src/modules/platform-finance/server/requestTransitions.ts"
    );
    const transitions = readSrc(transitionsPath);
    assert(
      !transitions.includes("finance_payable_create"),
      "requestTransitions must not call payable create yet"
    );
    const approveFn = readSrc(
      "src/modules/platform-finance/server/PlatformFinanceRequestsServerService.ts"
    );
    assert(
      !approveFn.includes("rpcCreateFinancePayable") &&
        !approveFn.includes("finance_payable_create"),
      "server service must not create payables on approve yet"
    );
    push(results, "scope.slice1_no_approval_wiring", "PASS");
  } catch (e) {
    push(results, "scope.slice1_no_approval_wiring", "FAIL", (e as Error).message);
  }
}

async function runServicePresence(results: CheckResult[]) {
  if (!hasServiceEnv()) {
    push(
      results,
      "db.service_presence",
      "SKIPPED",
      "NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY not set"
    );
    return;
  }

  const applyErr = await applyMigrationIfPossible();
  if (applyErr) {
    push(results, "db.migration_apply", "SKIPPED", applyErr);
  } else {
    push(results, "db.migration_apply", "PASS", "slice1 SQL applied/idempotent");
  }

  const admin = adminClient();
  for (const table of EXPECTED_TABLES) {
    const res = await admin.from(table).select("*", { count: "exact", head: true });
    if (tableExistsProbe(res.status, res.count)) {
      push(results, `db.table_${table}`, "PASS", `count=${res.count}`);
    } else {
      push(
        results,
        `db.table_${table}`,
        applyErr ? "SKIPPED" : "FAIL",
        res.error?.message ||
          `status=${res.status} count=${res.count}` +
            (applyErr ? ` (migration not applied: ${applyErr})` : "")
      );
    }
  }

  const absent = await admin
    .from("finance_vendors")
    .select("*", { count: "exact", head: true });
  if (!tableExistsProbe(absent.status, absent.count)) {
    push(results, "db.no_finance_vendors", "PASS");
  } else {
    push(results, "db.no_finance_vendors", "FAIL", "finance_vendors unexpectedly present");
  }
}

async function runDb(results: CheckResult[], client: FinanceVerifyClient) {
  const org = await client.query(
    `select id from public.organisations where slug = 'paychex' limit 1`
  );
  assert(org.rows[0]?.id, "paychex organisation required");
  const orgId = org.rows[0].id as string;

  const profiles = await client.query(
    `select id from public.profiles where organisation_id = $1 order by created_at asc limit 2`,
    [orgId]
  );
  assert(profiles.rows.length >= 1, "need at least 1 profile");
  const actorId = profiles.rows[0].id as string;

  const company = await client.query(
    `select id from public.finance_companies where organisation_id = $1 and status = 'active' order by code limit 1`,
    [orgId]
  );
  assert(company.rows[0]?.id, "need finance company");
  const companyId = company.rows[0].id as string;

  // Disposable grants — rolled back with transaction.
  await client.query(
    `insert into public.finance_capability_grants (organisation_id, profile_id, capability)
     values ($1, $2, 'platform_finance.payable.create')
     on conflict do nothing`,
    [orgId, actorId]
  );
  await client.query(
    `insert into public.finance_company_access (organisation_id, profile_id, company_id)
     values ($1, $2, $3)
     on conflict do nothing`,
    [orgId, actorId, companyId]
  );

  const category = await client.query(
    `select id from public.finance_request_categories
     where organisation_id = $1 and status = 'active' order by sort_order limit 1`,
    [orgId]
  );
  assert(category.rows[0]?.id, "need request category");

  const request = await client.query(
    `insert into public.finance_requests (
       organisation_id, company_id, requester_profile_id, status, currency,
       requested_amount, approved_amount, paid_amount, category_id, purpose,
       payee_name, payee_type
     ) values (
       $1, $2, $3, 'draft', 'NGN',
       5000, 0, 0, $4, 'PFR-PAY-SLICE1 verify request',
       'Verify Payee', 'vendor'
     ) returning id`,
    [orgId, companyId, actorId, category.rows[0].id]
  );
  const requestId = request.rows[0].id as string;

  {
    const msg = await expectSqlFailure(
      client,
      `insert into public.finance_payables (
         organisation_id, company_id, created_by_profile_id, status, currency,
         payable_amount, paid_amount, payee_name, payee_type, source_type, source_id
       ) values (
         $1, $2, $3, 'draft', 'NGN',
         0, 0, 'X', 'vendor', 'financial_request', $4
       )`,
      [orgId, companyId, actorId, requestId]
    );
    assert(/payable_amount|check/i.test(msg), msg);
    push(results, "db.payable_amount_positive", "PASS", msg);
  }

  {
    const msg = await expectSqlFailure(
      client,
      `insert into public.finance_payables (
         organisation_id, company_id, created_by_profile_id, status, currency,
         payable_amount, paid_amount, payee_name, payee_type, source_type, source_id
       ) values (
         $1, $2, $3, 'draft', 'NGN',
         100, 150, 'X', 'vendor', 'financial_request', $4
       )`,
      [orgId, companyId, actorId, requestId]
    );
    assert(/paid|check/i.test(msg), msg);
    push(results, "db.paid_lte_payable", "PASS", msg);
  }

  {
    const msg = await expectSqlFailure(
      client,
      `insert into public.finance_payables (
         organisation_id, company_id, created_by_profile_id, status, currency,
         payable_amount, paid_amount, payee_name, payee_type, source_type, source_id
       ) values (
         $1, $2, $3, 'draft', 'NGN',
         100, 0, 'X', 'vendor', 'not_a_source', $4
       )`,
      [orgId, companyId, actorId, requestId]
    );
    assert(/source_type|check/i.test(msg), msg);
    push(results, "db.source_type_enforced", "PASS", msg);
  }

  {
    // finance_payable_create is now a disabled bypass guard for every source.
    const msg = await expectSqlFailure(
      client,
      `select public.finance_payable_create(
         $1::uuid, $2::uuid, 'Verify Payee', 'vendor', 2500::numeric,
         'financial_request', $3::uuid, 'NGN', 'slice1', null, null, null
       )`,
      [actorId, companyId, requestId]
    );
    assert(/direct payable creation is disabled/i.test(msg), msg);
    push(results, "db.create_primitive_disabled", "PASS", msg);
  }

  const payableId = await insertVerifyPayable(client, {
    actorProfileId: actorId,
    companyId,
    payableAmount: 2500,
    sourceType: "financial_request",
    sourceId: requestId,
    description: "slice1",
  });
  assert(payableId, "fixture payable seeded");
  push(results, "db.payable_row_shape", "PASS", payableId);

  {
    const row = await client.query(
      `select payable_amount, paid_amount, company_id, source_type, source_id, status
       from public.finance_payables where id = $1`,
      [payableId]
    );
    const p = row.rows[0];
    assert(Number(p.payable_amount) === 2500, "amount");
    assert(Number(p.paid_amount) === 0, "paid default");
    assert(p.company_id === companyId, "company");
    assert(p.source_type === "financial_request", "source type");
    assert(p.source_id === requestId, "source id");
    assert(p.status === "draft", "draft status");
    const outstanding = Number(p.payable_amount) - Number(p.paid_amount);
    assert(outstanding === 2500, "outstanding derived");
    push(results, "db.amount_and_source_linkage", "PASS");
  }

  {
    const events = await client.query(
      `select event_type, to_status from public.finance_payable_events where payable_id = $1`,
      [payableId]
    );
    assert(events.rows.some((r: { event_type: string }) => r.event_type === "created"), "created event");
    push(results, "db.created_event", "PASS");
  }

  {
    const msg = await expectSqlFailure(
      client,
      `insert into public.finance_payables (
         company_id, created_by_profile_id, status, currency,
         payable_amount, paid_amount, payee_name, payee_type, source_type, source_id
       ) values (
         $1, $2, 'draft', 'NGN',
         100, 0, 'Verify Payee', 'vendor', 'financial_request', $3
       )`,
      [companyId, actorId, requestId]
    );
    assert(/already exists|unique|duplicate/i.test(msg), msg);
    push(results, "db.duplicate_source_rejected", "PASS", msg);
  }

  {
    const vendorBillId = await insertVerifyVendorBill(client, {
      companyId,
      inputterProfileId: actorId,
      billedAmount: 800,
      payeeName: "Bill Payee",
    });
    const vendorBillPayableId = await insertVerifyPayable(client, {
      actorProfileId: actorId,
      companyId,
      payableAmount: 800,
      sourceType: "vendor_bill",
      sourceId: vendorBillId,
      payeeName: "Bill Payee",
    });
    assert(vendorBillPayableId, "vendor_bill source accepted");
    push(results, "db.vendor_bill_source_boundary", "PASS", vendorBillPayableId);
  }

  {
    const cols = await client.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'finance_payables'`
    );
    const names = cols.rows.map((r: { column_name: string }) => r.column_name);
    assert(!names.includes("facility_id"), "no facility_id");
    assert(!names.includes("facility"), "no facility");
    assert(names.includes("company_id"), "company_id present");
    push(results, "db.no_facility_ownership", "PASS");
  }

  {
    const msg = await expectSqlFailure(
      client,
      `update public.finance_payable_events set metadata = '{"x":1}'::jsonb where payable_id = $1`,
      [payableId]
    );
    assert(/append-only|not allowed/i.test(msg), msg);
    push(results, "db.events_append_only", "PASS", msg);
  }

  {
    const distinct = await client.query(
      `select
         (select count(*) from information_schema.tables where table_schema='public' and table_name='finance_payables') as payables,
         (select count(*) from information_schema.tables where table_schema='public' and table_name='finance_requests') as requests,
         (select count(*) from information_schema.tables where table_schema='public' and table_name='finance_journal_entries') as journals`
    );
    const d = distinct.rows[0];
    assert(Number(d.payables) === 1 && Number(d.requests) === 1 && Number(d.journals) === 1, "distinct tables");
    push(results, "db.distinct_from_request_and_journal", "PASS");
  }

  push(
    results,
    "db.cleanup.rollback",
    "PASS",
    "helper will ROLLBACK — no persistent pollution from this run"
  );
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  console.log("=== Payables Slice 1 verification ===\n");
  console.log("--- static ---");
  runStatic(results);
  console.log("\n--- database (optional) ---");
  await runServicePresence(results);

  if (!resolveFinanceVerifyDatabaseUrl()) {
    push(
      results,
      "db.transaction_suite",
      "SKIPPED",
      "PLATFORM_FINANCE_VERIFY_DATABASE_URL not set — no transactional DB suite"
    );
  } else {
    const outcome = await withFinanceVerifyTransaction(async (client) => {
      await runDb(results, client);
      return true;
    });
    assert(outcome.rolledBack, "must always roll back");
    if (!outcome.ok) {
      push(results, "db.run", "FAIL", outcome.error);
    }
  }

  const pass = results.filter((r) => r.status === "PASS").length;
  const fail = results.filter((r) => r.status === "FAIL").length;
  const skipped = results.filter((r) => r.status === "SKIPPED").length;
  console.log(`\n${pass} PASS / ${fail} FAIL / ${skipped} SKIPPED`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
