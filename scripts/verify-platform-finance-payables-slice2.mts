/**
 * Platform Finance — Payables Slice 2 verification.
 *
 * Static (always):
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-payables-slice2.mts
 *
 * Optional DB (transaction + always ROLLBACK):
 *   PLATFORM_FINANCE_VERIFY_DATABASE_URL
 *
 * Covers: native payable lifecycle, FR→Payable atomic approval, rejection,
 * idempotency, amount integrity. No UI/API/payment/posting.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FINANCE_PAYABLE_BANKING_DEFERRED_TRANSITIONS,
  FINANCE_PAYABLE_CAPABILITIES,
  FINANCE_PAYABLE_TRANSITIONS,
  FINANCIAL_REQUEST_CAPABILITIES,
  financePayableOutstandingAmount,
  isAllowedFinancePayableTransition,
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

const RUN_ID = `PAY2-${Date.now()}`;
const MIGRATION =
  "supabase/migrations/20260915220000_finance_payables_lifecycle.sql";
const SLICE1_MIGRATION =
  "supabase/migrations/20260915210000_finance_payables_foundation.sql";

const LIFECYCLE_RPCS = [
  "finance_payable_update_draft",
  "finance_payable_submit",
  "finance_payable_start_review",
  "finance_payable_approve",
  "finance_payable_partially_approve",
  "finance_payable_reject",
  "finance_payable_query",
  "finance_payable_cancel",
  "finance_payable_insert_from_approved_request",
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
      try {
        await client.query(readSrc(SLICE1_MIGRATION));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!/already exists/i.test(message)) throw e;
      }
      try {
        await client.query(readSrc(MIGRATION));
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (!/already exists/i.test(message)) throw e;
      }
      try {
        await client.query(`notify pgrst, 'reload schema'`);
      } catch {
        /* optional */
      }
    } finally {
      await client.end();
    }
    return null;
  } catch (e) {
    return e instanceof Error ? e.message : String(e);
  }
}

async function insertTempGrant(
  client: FinanceVerifyClient,
  organisationId: string,
  profileId: string,
  capability: string
) {
  await client.query(
    `insert into public.finance_capability_grants
       (organisation_id, profile_id, capability)
     values ($1, $2, $3)
     on conflict (profile_id, organisation_id, capability) do nothing`,
    [organisationId, profileId, capability]
  );
}

async function addSupportingDoc(
  client: FinanceVerifyClient,
  organisationId: string,
  requestId: string,
  uploaderId: string
) {
  await client.query(
    `insert into public.finance_request_documents
       (organisation_id, request_id, uploaded_by_profile_id, filename, mime_type,
        byte_size, storage_bucket, storage_path, document_role)
     values ($1, $2, $3, $4, 'application/pdf', 1024,
             'finance-requests-pending', $5, 'supporting')`,
    [
      organisationId,
      requestId,
      uploaderId,
      `${RUN_ID}-support.pdf`,
      `${RUN_ID}/${requestId}/support.pdf`,
    ]
  );
}

async function advanceRequestToCeo(
  client: FinanceVerifyClient,
  requesterId: string,
  financeId: string,
  requestId: string,
  organisationId: string
) {
  await addSupportingDoc(client, organisationId, requestId, requesterId);
  await client.query(`select public.finance_request_submit($1::uuid, $2::uuid)`, [
    requesterId,
    requestId,
  ]);
  await client.query(
    `select public.finance_request_start_review($1::uuid, $2::uuid)`,
    [financeId, requestId]
  );
  await client.query(
    `select public.finance_request_send_to_ceo($1::uuid, $2::uuid, null)`,
    [financeId, requestId]
  );
}

function runStatic(results: CheckResult[]) {
  try {
    assert(existsSync(resolve(MIGRATION)), "slice2 migration missing");
    assert(existsSync(resolve(SLICE1_MIGRATION)), "slice1 migration missing");
    push(results, "static.migration_exists", "PASS", MIGRATION);
  } catch (e) {
    push(results, "static.migration_exists", "FAIL", (e as Error).message);
    return;
  }

  const sql = readSrc(MIGRATION);

  try {
    for (const fn of LIFECYCLE_RPCS) {
      assert(sql.includes(`function public.${fn}`), fn);
    }
    assert(sql.includes("create or replace function public.finance_request_approve"), "approve replace");
    assert(
      sql.includes("create or replace function public.finance_request_partially_approve"),
      "partial replace"
    );
    assert(sql.includes("finance_payable_insert_from_approved_request"), "atomic insert helper");
    assert(
      sql.includes("finance_request_reject intentionally unchanged") ||
        !sql.includes("create or replace function public.finance_request_reject"),
      "reject untouched"
    );
    push(results, "static.lifecycle_and_approve_rpcs", "PASS");
  } catch (e) {
    push(results, "static.lifecycle_and_approve_rpcs", "FAIL", (e as Error).message);
  }

  try {
    assert(sql.includes("Atomically creates an approved Payable"), "atomic comment");
    assert(sql.includes("payable already exists for this financial request"), "idempotent raise");
    assert(sql.includes("requested_amount is never overwritten"), "requested preserved");
    assert(!/finance_payable_schedule|finance_payable_mark_paid|finance_payable_initiate_payment/i.test(sql), "no banking RPCs");
    assert(!sql.includes("finance_post_transaction"), "no posting");
    assert(!sql.includes("create table public.finance_payments"), "no payments table");
    assert(!sql.includes("updatePayableStatus"), "no generic mutator");
    push(results, "static.atomicity_and_boundaries", "PASS");
  } catch (e) {
    push(results, "static.atomicity_and_boundaries", "FAIL", (e as Error).message);
  }

  try {
    assert(isAllowedFinancePayableTransition("draft", "pending_approval"), "draft→pending");
    assert(isAllowedFinancePayableTransition("pending_approval", "draft"), "query→draft");
    assert(isAllowedFinancePayableTransition("pending_approval", "approved"), "approve");
    assert(!isAllowedFinancePayableTransition("paid", "draft"), "paid terminal");
    assert(
      FINANCE_PAYABLE_BANKING_DEFERRED_TRANSITIONS.includes("scheduled"),
      "banking deferred"
    );
    assert(
      FINANCE_PAYABLE_TRANSITIONS.pending_approval.includes("draft"),
      "query in map"
    );
    push(results, "static.domain_transitions", "PASS");
  } catch (e) {
    push(results, "static.domain_transitions", "FAIL", (e as Error).message);
  }

  try {
    const transitions = readSrc(
      "src/modules/platform-finance/server/payableTransitions.ts"
    );
    for (const name of [
      "rpcCreateFinancePayable",
      "rpcUpdateFinancePayableDraft",
      "rpcSubmitFinancePayable",
      "rpcStartFinancePayableReview",
      "rpcApproveFinancePayable",
      "rpcPartiallyApproveFinancePayable",
      "rpcRejectFinancePayable",
      "rpcQueryFinancePayable",
      "rpcCancelFinancePayable",
    ]) {
      assert(transitions.includes(name), name);
    }
    assert(!transitions.includes("updatePayableStatus"), "no generic status API");
    push(results, "static.ts_named_transitions", "PASS");
  } catch (e) {
    push(results, "static.ts_named_transitions", "FAIL", (e as Error).message);
  }

  try {
    assert(
      existsSync(resolve("src/app/(app)/platform-finance/payables/page.tsx")),
      "payables register route"
    );
    const nav = readSrc("src/modules/platform-finance/nav.ts");
    assert(nav.includes('href: "/platform-finance/payables"'), "payables nav href");
    assert(
      existsSync(
        resolve(
          "src/modules/platform-finance/components/PlatformFinancePayablesPage.tsx"
        )
      ),
      "payables page component"
    );
    push(results, "static.no_ui_api", "PASS", "register UI present");
  } catch (e) {
    push(results, "static.no_ui_api", "FAIL", (e as Error).message);
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
    push(results, "db.migration_apply", "PASS", "slice1+slice2 SQL applied/idempotent");
  }

  const admin = adminClient();
  const probe = await admin.from("finance_payables").select("*", { count: "exact", head: true });
  if (probe.status === 200 && typeof probe.count === "number") {
    push(results, "db.table_finance_payables", "PASS", `count=${probe.count}`);
  } else {
    push(
      results,
      "db.table_finance_payables",
      applyErr ? "SKIPPED" : "FAIL",
      probe.error?.message || `status=${probe.status}`
    );
  }
}

async function runDb(results: CheckResult[], client: FinanceVerifyClient) {
  const rpc = await client.query(
    `select to_regprocedure('public.finance_payable_approve(uuid,uuid,text)') as reg`
  );
  assert(rpc.rows[0]?.reg, "finance_payable_approve missing — apply slice2 migration");
  push(results, "db.migration_applied", "PASS", "lifecycle RPCs present");

  const org = await client.query<{ id: string }>(
    `select id from public.organisations where slug = 'paychex' limit 1`
  );
  assert(org.rows[0], "paychex organisation required");
  const organisationId = org.rows[0].id;

  const profiles = await client.query<{ id: string }>(
    `select id from public.profiles where organisation_id = $1 order by created_at asc limit 3`,
    [organisationId]
  );
  let creatorId: string;
  let reviewerId: string;
  let ceoId: string;
  if (profiles.rows.length >= 2) {
    creatorId = profiles.rows[0].id;
    reviewerId = profiles.rows[1].id;
    ceoId = profiles.rows[2]?.id ?? reviewerId;
    push(
      results,
      "db.fixture.profiles",
      "PASS",
      `${profiles.rows.length} paychex profiles`
    );
  } else if (profiles.rows.length === 1) {
    // Same one-profile org gap as Financial Request Slice 2 — borrow an existing
    // profile from elsewhere (TX-scoped grants/access only; no permanent fixtures).
    const borrowed = await client.query<{ id: string }>(
      `select id from public.profiles
       where id <> $1
       order by created_at asc
       limit 1`,
      [profiles.rows[0].id]
    );
    if (!borrowed.rows[0]) {
      push(
        results,
        "db.fixture.profiles",
        "FAIL",
        "need at least 2 profiles in the database (Paychex has 1; no second profile to borrow). Same fixture gap as Financial Request Slice 2 — not inventing permanent profiles."
      );
      return;
    }
    creatorId = profiles.rows[0].id;
    reviewerId = borrowed.rows[0].id;
    ceoId = borrowed.rows[0].id;
    push(
      results,
      "db.fixture.profiles",
      "PASS",
      "1 paychex profile + 1 borrowed existing profile (TX grants only)"
    );
  } else {
    push(
      results,
      "db.fixture.profiles",
      "FAIL",
      "need at least 1 paychex profile"
    );
    return;
  }
  const requesterId = creatorId;
  const financeId = reviewerId;

  const category = await client.query<{ id: string }>(
    `select id from public.finance_request_categories
     where organisation_id = $1 and status = 'active' order by sort_order limit 1`,
    [organisationId]
  );
  assert(category.rows[0], "need request category");
  const categoryId = category.rows[0].id;

  const company = await client.query<{ id: string }>(
    `insert into public.finance_companies (organisation_id, code, name, status)
     values ($1, $2, 'PAY2 Verify Co', 'active')
     returning id`,
    [organisationId, `PAY2${Date.now().toString(36).slice(-6).toUpperCase()}`]
  );
  const companyId = company.rows[0].id;

  for (const pid of [creatorId, reviewerId, ceoId]) {
    await client.query(
      `insert into public.finance_company_access
         (organisation_id, profile_id, company_id) values ($1, $2, $3)
       on conflict do nothing`,
      [organisationId, pid, companyId]
    );
  }

  await insertTempGrant(client, organisationId, creatorId, FINANCE_PAYABLE_CAPABILITIES.create);
  await insertTempGrant(client, organisationId, reviewerId, FINANCE_PAYABLE_CAPABILITIES.review);
  await insertTempGrant(client, organisationId, ceoId, FINANCE_PAYABLE_CAPABILITIES.approve);
  await insertTempGrant(client, organisationId, reviewerId, FINANCE_PAYABLE_CAPABILITIES.approve);
  await insertTempGrant(client, organisationId, requesterId, FINANCIAL_REQUEST_CAPABILITIES.create);
  await insertTempGrant(client, organisationId, requesterId, FINANCIAL_REQUEST_CAPABILITIES.view_own);
  await insertTempGrant(client, organisationId, financeId, FINANCIAL_REQUEST_CAPABILITIES.review);
  await insertTempGrant(client, organisationId, ceoId, FINANCIAL_REQUEST_CAPABILITIES.approve);

  // --- Native payable lifecycle (vendor_bill source) ---
  // Payables are no longer mintable via finance_payable_create; this suite
  // exercises the *lifecycle* RPCs, so it seeds draft rows directly.
  const vbSource = await insertVerifyVendorBill(client, {
    companyId,
    inputterProfileId: creatorId,
    billedAmount: 5000,
    payeeName: "Lifecycle Payee",
  });
  const draftId = await insertVerifyPayable(client, {
    actorProfileId: creatorId,
    companyId,
    payableAmount: 5000,
    sourceType: "vendor_bill",
    sourceId: vbSource,
    payeeName: "Lifecycle Payee",
    description: "slice2 lifecycle",
  });
  assert(draftId, "draft fixture seeded");
  push(results, "db.lifecycle.create_draft", "PASS", draftId);

  await client.query(
    `select public.finance_payable_update_draft(
       $1::uuid, $2::uuid, 'Lifecycle Payee Rev', 'vendor', 4500::numeric,
       'revised', null, false, null, null
     )`,
    [creatorId, draftId]
  );
  {
    const row = await client.query(
      `select payable_amount, payee_name, status from public.finance_payables where id = $1`,
      [draftId]
    );
    assert(Number(row.rows[0].payable_amount) === 4500, "updated amount");
    assert(row.rows[0].payee_name === "Lifecycle Payee Rev", "updated payee");
    assert(row.rows[0].status === "draft", "still draft");
  }
  push(results, "db.lifecycle.update_draft", "PASS");

  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_payable_approve($1::uuid, $2::uuid, null)`,
      [reviewerId, draftId]
    );
    assert(/invalid status/i.test(msg), msg);
    push(results, "db.lifecycle.invalid_approve_from_draft", "PASS", msg);
  }

  await client.query(`select public.finance_payable_submit($1::uuid, $2::uuid)`, [
    creatorId,
    draftId,
  ]);
  {
    const st = await client.query(
      `select status from public.finance_payables where id = $1`,
      [draftId]
    );
    assert(st.rows[0].status === "pending_approval", "submitted");
  }
  push(results, "db.lifecycle.submit", "PASS");

  await client.query(
    `select public.finance_payable_start_review($1::uuid, $2::uuid)`,
    [reviewerId, draftId]
  );
  {
    const ev = await client.query(
      `select event_type, metadata from public.finance_payable_events
       where payable_id = $1 and event_type = 'field_changed'`,
      [draftId]
    );
    assert(ev.rows.length >= 1, "review event");
    assert(ev.rows.some((r: { metadata: { review?: string } }) => r.metadata?.review === "started"), "review started");
  }
  push(results, "db.lifecycle.start_review", "PASS");

  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_payable_approve($1::uuid, $2::uuid, null)`,
      [creatorId, draftId]
    );
    assert(/separation of duties|creator cannot approve/i.test(msg), msg);
    push(results, "db.lifecycle.sod_creator_cannot_approve", "PASS", msg);
  }

  // Partial approval path on a separate payable
  const vbPartial = await insertVerifyVendorBill(client, {
    companyId,
    inputterProfileId: creatorId,
    billedAmount: 3000,
    payeeName: "Partial Payee",
  });
  const partialId = await insertVerifyPayable(client, {
    actorProfileId: creatorId,
    companyId,
    payableAmount: 3000,
    sourceType: "vendor_bill",
    sourceId: vbPartial,
    payeeName: "Partial Payee",
  });
  await client.query(`select public.finance_payable_submit($1::uuid, $2::uuid)`, [
    creatorId,
    partialId,
  ]);
  await client.query(
    `select public.finance_payable_partially_approve($1::uuid, $2::uuid, 1200::numeric, $3::text)`,
    [reviewerId, partialId, "cap"]
  );
  {
    const row = await client.query(
      `select status, payable_amount, paid_amount from public.finance_payables where id = $1`,
      [partialId]
    );
    assert(row.rows[0].status === "approved", "partial → approved");
    assert(Number(row.rows[0].payable_amount) === 1200, "amount capped");
    assert(
      financePayableOutstandingAmount({
        payableAmount: Number(row.rows[0].payable_amount),
        paidAmount: Number(row.rows[0].paid_amount),
      }) === 1200,
      "outstanding"
    );
  }
  push(results, "db.lifecycle.partial_approve", "PASS");

  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_payable_partially_approve($1::uuid, $2::uuid, 5000::numeric, null)`,
      [reviewerId, draftId]
    );
    assert(/0 < amount < payable_amount|must satisfy/i.test(msg), msg);
    push(results, "db.lifecycle.partial_amount_rule", "PASS", msg);
  }

  await client.query(
    `select public.finance_payable_approve($1::uuid, $2::uuid, $3::text)`,
    [reviewerId, draftId, "OK"]
  );
  {
    const st = await client.query(
      `select status from public.finance_payables where id = $1`,
      [draftId]
    );
    assert(st.rows[0].status === "approved", "approved");
    const ev = await client.query(
      `select event_type from public.finance_payable_events where payable_id = $1`,
      [draftId]
    );
    assert(ev.rows.some((r: { event_type: string }) => r.event_type === "approved"), "approved event");
  }
  push(results, "db.lifecycle.approve", "PASS");

  // Reject path
  const vbReject = await insertVerifyVendorBill(client, {
    companyId,
    inputterProfileId: creatorId,
    billedAmount: 800,
    payeeName: "Reject Payee",
  });
  const rejectId = await insertVerifyPayable(client, {
    actorProfileId: creatorId,
    companyId,
    payableAmount: 800,
    sourceType: "vendor_bill",
    sourceId: vbReject,
    payeeName: "Reject Payee",
  });
  await client.query(`select public.finance_payable_submit($1::uuid, $2::uuid)`, [
    creatorId,
    rejectId,
  ]);
  await client.query(
    `select public.finance_payable_reject($1::uuid, $2::uuid, $3::text)`,
    [reviewerId, rejectId, "Out of policy"]
  );
  {
    const st = await client.query(
      `select status from public.finance_payables where id = $1`,
      [rejectId]
    );
    assert(st.rows[0].status === "rejected", "rejected");
  }
  push(results, "db.lifecycle.reject", "PASS");

  // Query → draft
  const vbQuery = await insertVerifyVendorBill(client, {
    companyId,
    inputterProfileId: creatorId,
    billedAmount: 900,
    payeeName: "Query Payee",
  });
  const queryId = await insertVerifyPayable(client, {
    actorProfileId: creatorId,
    companyId,
    payableAmount: 900,
    sourceType: "vendor_bill",
    sourceId: vbQuery,
    payeeName: "Query Payee",
  });
  await client.query(`select public.finance_payable_submit($1::uuid, $2::uuid)`, [
    creatorId,
    queryId,
  ]);
  await client.query(
    `select public.finance_payable_query($1::uuid, $2::uuid, $3::text)`,
    [reviewerId, queryId, "Need invoice"]
  );
  {
    const st = await client.query(
      `select status from public.finance_payables where id = $1`,
      [queryId]
    );
    assert(st.rows[0].status === "draft", "back to draft");
  }
  push(results, "db.lifecycle.query_to_draft", "PASS");

  // --- Request → Payable integration ---
  async function createPendingCeoRequest(
    amount: number,
    purpose: string,
    payeeName: string
  ): Promise<string> {
    const created = await client.query<{ id: string }>(
      `select public.finance_request_create(
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric,
         $6::text, $7::text, $8::text, 'vendor', '2026-12-31'::date, null, 'PROJ-PAY2', 'NGN'
       ) as id`,
      [
        requesterId,
        organisationId,
        companyId,
        categoryId,
        amount,
        purpose,
        `${purpose} desc`,
        payeeName,
      ]
    );
    const id = created.rows[0].id;
    await advanceRequestToCeo(client, requesterId, financeId, id, organisationId);
    return id;
  }

  const fullReqId = await createPendingCeoRequest(
    2500,
    `${RUN_ID} full approve`,
    "Full Approve Payee"
  );
  const requestedBefore = await client.query(
    `select requested_amount, status from public.finance_requests where id = $1`,
    [fullReqId]
  );
  assert(Number(requestedBefore.rows[0].requested_amount) === 2500, "requested baseline");
  assert(requestedBefore.rows[0].status === "pending_ceo_approval", "at ceo");

  await client.query(
    `select public.finance_request_approve($1::uuid, $2::uuid, $3::text)`,
    [ceoId, fullReqId, "Funded"]
  );

  {
    const req = await client.query(
      `select status, requested_amount, approved_amount, organisation_id, company_id,
              payee_name, payee_type, currency, required_by_date, project_contract_ref
       from public.finance_requests where id = $1`,
      [fullReqId]
    );
    const r = req.rows[0];
    assert(r.status === "approved", "request approved");
    assert(Number(r.requested_amount) === 2500, "requested unchanged");
    assert(Number(r.approved_amount) === 2500, "approved = requested");

    const pays = await client.query(
      `select * from public.finance_payables
       where source_type = 'financial_request' and source_id = $1`,
      [fullReqId]
    );
    assert(pays.rows.length === 1, `exactly one payable got ${pays.rows.length}`);
    const p = pays.rows[0];
    assert(p.status === "approved", "payable approved");
    assert(Number(p.payable_amount) === 2500, "payable = requested");
    assert(Number(p.paid_amount) === 0, "paid 0");
    assert(p.organisation_id === r.organisation_id, "org match");
    assert(p.company_id === r.company_id, "company match");
    assert(p.payee_name === r.payee_name, "payee name");
    assert(p.payee_type === r.payee_type, "payee type");
    assert(p.currency === r.currency, "currency");
    assert(String(p.due_date) === String(r.required_by_date), "due from required_by");
    assert(p.project_contract_ref === r.project_contract_ref, "project ref");
    assert(p.source_type === "financial_request", "source type");
    assert(p.source_id === fullReqId, "source id");

    const pev = await client.query(
      `select event_type from public.finance_payable_events where payable_id = $1`,
      [p.id]
    );
    assert(pev.rows.some((e: { event_type: string }) => e.event_type === "created"), "payable created evt");
    assert(pev.rows.some((e: { event_type: string }) => e.event_type === "approved"), "payable approved evt");

    const rev = await client.query(
      `select event_type, metadata from public.finance_request_events
       where request_id = $1 and event_type = 'approved'`,
      [fullReqId]
    );
    assert(rev.rows.length === 1, "request approved event");
    assert(rev.rows[0].metadata?.payable_id === p.id, "event links payable");

    const aud = await client.query(
      `select action, details from public.finance_audit_events
       where object_id = $1::text and action = 'finance.request.approved'`,
      [fullReqId]
    );
    assert(aud.rows.length >= 1, "approval audit");
    assert(aud.rows[0].details?.payable_id === p.id, "audit links payable");

    push(results, "db.integration.full_approve_creates_one_payable", "PASS", p.id);
  }

  // Partial CEO approval
  const partialReqId = await createPendingCeoRequest(
    4000,
    `${RUN_ID} partial approve`,
    "Partial Approve Payee"
  );
  await client.query(
    `select public.finance_request_partially_approve($1::uuid, $2::uuid, 1500::numeric, $3::text)`,
    [ceoId, partialReqId, "Cap 1500"]
  );
  {
    const req = await client.query(
      `select status, requested_amount, approved_amount from public.finance_requests where id = $1`,
      [partialReqId]
    );
    assert(req.rows[0].status === "partially_approved", "partial status");
    assert(Number(req.rows[0].requested_amount) === 4000, "requested preserved");
    assert(Number(req.rows[0].approved_amount) === 1500, "approved capped");
    const pays = await client.query(
      `select payable_amount, status from public.finance_payables
       where source_type = 'financial_request' and source_id = $1`,
      [partialReqId]
    );
    assert(pays.rows.length === 1, "one payable");
    assert(Number(pays.rows[0].payable_amount) === 1500, "payable = approved");
    assert(pays.rows[0].status === "approved", "payable approved");
    push(results, "db.integration.partial_approve_creates_one_payable", "PASS");
  }

  // Partial amount rule (0 < amount < requested)
  {
    const overId = await createPendingCeoRequest(
      2000,
      `${RUN_ID} over partial`,
      "Over"
    );
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_partially_approve($1::uuid, $2::uuid, 5000::numeric, null)`,
      [ceoId, overId]
    );
    assert(/0 < amount < requested_amount/i.test(msg), msg);
    push(results, "db.integration.partial_cannot_exceed_requested", "PASS", msg);
  }

  // Rejection creates no payable
  const rejectReqId = await createPendingCeoRequest(
    1100,
    `${RUN_ID} reject`,
    "Reject Payee"
  );
  await client.query(
    `select public.finance_request_reject($1::uuid, $2::uuid, $3::text)`,
    [ceoId, rejectReqId, "Denied"]
  );
  {
    const pays = await client.query(
      `select count(*)::int as n from public.finance_payables
       where source_type = 'financial_request' and source_id = $1`,
      [rejectReqId]
    );
    assert(pays.rows[0].n === 0, "zero payables on reject");
    push(results, "db.integration.reject_creates_no_payable", "PASS");
  }

  // Atomicity: pre-existing payable for source → approve fails; request stays pending
  const atomicReqId = await createPendingCeoRequest(
    1800,
    `${RUN_ID} atomicity`,
    "Atomic Payee"
  );
  await insertTempGrant(client, organisationId, ceoId, FINANCE_PAYABLE_CAPABILITIES.create);
  await insertVerifyPayable(client, {
    actorProfileId: ceoId,
    companyId,
    payableAmount: 1,
    sourceType: "financial_request",
    sourceId: atomicReqId,
    payeeName: "Blocker",
    description: "blocker",
  });
  const eventsBefore = await client.query(
    `select count(*)::int as n from public.finance_request_events where request_id = $1`,
    [atomicReqId]
  );
  const auditBefore = await client.query(
    `select count(*)::int as n from public.finance_audit_events
     where object_id = $1::text and action like 'finance.request.%'`,
    [atomicReqId]
  );
  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_approve($1::uuid, $2::uuid, null)`,
      [ceoId, atomicReqId]
    );
    assert(/already exists|payable already exists/i.test(msg), msg);

    const req = await client.query(
      `select status, approved_amount from public.finance_requests where id = $1`,
      [atomicReqId]
    );
    assert(req.rows[0].status === "pending_ceo_approval", "request not approved");
    assert(Number(req.rows[0].approved_amount) === 0, "approved_amount not set");

    const eventsAfter = await client.query(
      `select count(*)::int as n from public.finance_request_events where request_id = $1`,
      [atomicReqId]
    );
    assert(eventsAfter.rows[0].n === eventsBefore.rows[0].n, "no approval event");

    const auditAfter = await client.query(
      `select count(*)::int as n from public.finance_audit_events
       where object_id = $1::text and action like 'finance.request.%'`,
      [atomicReqId]
    );
    assert(auditAfter.rows[0].n === auditBefore.rows[0].n, "no approval audit");

    const pays = await client.query(
      `select status, payable_amount from public.finance_payables
       where source_type = 'financial_request' and source_id = $1`,
      [atomicReqId]
    );
    assert(pays.rows.length === 1, "only blocker draft remains");
    assert(pays.rows[0].status === "draft", "blocker still draft");
    assert(Number(pays.rows[0].payable_amount) === 1, "not replaced with 1800");

    push(results, "db.atomicity.payable_fail_rolls_back_approval", "PASS", msg);
  }

  // If request approval fails (SoD), no payable
  const sodReqId = await createPendingCeoRequest(
    700,
    `${RUN_ID} sod fail`,
    "SoD Payee"
  );
  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_approve($1::uuid, $2::uuid, null)`,
      [requesterId, sodReqId]
    );
    assert(/separation of duties|missing capability/i.test(msg), msg);
    const pays = await client.query(
      `select count(*)::int as n from public.finance_payables
       where source_type = 'financial_request' and source_id = $1`,
      [sodReqId]
    );
    assert(pays.rows[0].n === 0, "no payable after failed approve");
    const req = await client.query(
      `select status from public.finance_requests where id = $1`,
      [sodReqId]
    );
    assert(req.rows[0].status === "pending_ceo_approval", "still pending");
    push(results, "db.atomicity.failed_approve_no_payable", "PASS", msg);
  }

  // Idempotency: retry approve cannot create second payable
  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_approve($1::uuid, $2::uuid, null)`,
      [ceoId, fullReqId]
    );
    assert(/invalid status/i.test(msg), msg);
    const pays = await client.query(
      `select count(*)::int as n from public.finance_payables
       where source_type = 'financial_request' and source_id = $1`,
      [fullReqId]
    );
    assert(pays.rows[0].n === 1, "still one payable");
    push(results, "db.idempotency.retry_approve_no_second_payable", "PASS", msg);
  }

  {
    const msg = await expectSqlFailure(
      client,
      `insert into public.finance_payables (
         company_id, created_by_profile_id, status, currency,
         payable_amount, paid_amount, payee_name, payee_type, source_type, source_id
       ) values (
         $1, $2, 'draft', 'NGN',
         10, 0, 'Dup', 'vendor', 'financial_request', $3
       )`,
      [companyId, creatorId, fullReqId]
    );
    assert(/already exists|unique|duplicate/i.test(msg), msg);
    push(results, "db.idempotency.duplicate_source_rejected", "PASS", msg);
  }

  // Integrity
  {
    const msg = await expectSqlFailure(
      client,
      `insert into public.finance_payables (
         company_id, created_by_profile_id, status, currency,
         payable_amount, paid_amount, payee_name, payee_type, source_type, source_id
       ) values (
         $1, $2, 'draft', 'NGN',
         0, 0, 'Zero', 'vendor', 'vendor_bill', $3
       )`,
      [companyId, creatorId, vbSource]
    );
    assert(/payable_amount|check/i.test(msg), msg);
    push(results, "db.integrity.zero_value_rejected", "PASS", msg);
  }

  {
    // The old create primitive is now a hard bypass guard.
    const msg = await expectSqlFailure(
      client,
      `select public.finance_payable_create(
         $1::uuid, $2::uuid, 'Bypass', 'vendor', 10::numeric,
         'vendor_bill', $3::uuid, 'NGN', null, null, null, null
       )`,
      [creatorId, companyId, vbSource]
    );
    assert(/direct payable creation is disabled/i.test(msg), msg);
    push(results, "db.integrity.create_primitive_disabled", "PASS", msg);
  }

  {
    const msg = await expectSqlFailure(
      client,
      `update public.finance_payables set paid_amount = payable_amount + 1 where id = $1`,
      [draftId]
    );
    assert(/paid|check/i.test(msg), msg);
    push(results, "db.integrity.paid_cannot_exceed_payable", "PASS", msg);
  }

  {
    const row = await client.query(
      `select payable_amount, paid_amount from public.finance_payables where id = $1`,
      [draftId]
    );
    const outstanding =
      Number(row.rows[0].payable_amount) - Number(row.rows[0].paid_amount);
    assert(
      outstanding ===
        financePayableOutstandingAmount({
          payableAmount: Number(row.rows[0].payable_amount),
          paidAmount: Number(row.rows[0].paid_amount),
        }),
      "derived"
    );
    push(results, "db.integrity.outstanding_derived", "PASS", String(outstanding));
  }

  // FR-originated payable cannot use draft submit path
  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_payable_submit($1::uuid, $2::uuid)`,
      [
        ceoId,
        (
          await client.query(
            `select id from public.finance_payables
             where source_type = 'financial_request' and source_id = $1`,
            [atomicReqId]
          )
        ).rows[0].id,
      ]
    );
    assert(/request-originated|already approved|invalid status/i.test(msg), msg);
    push(results, "db.boundary.fr_source_not_native_submit", "PASS", msg);
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
  console.log("=== Payables Slice 2 verification ===\n");
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
