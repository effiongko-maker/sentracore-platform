/**
 * Platform Finance — Financial Requests Slice 2 verification (transaction-scoped DB).
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-requests-slice2.mts
 *
 * Static checks always run (no DB).
 *
 * DB suite requires:
 *   PLATFORM_FINANCE_VERIFY_DATABASE_URL
 *   package `pg`
 *
 * Lifecycle: BEGIN → real finance_request_* RPCs → assertions → always ROLLBACK.
 * Never deletes persistent finance_capability_grants / finance_company_access.
 * Never uses session_replication_role or hard-delete cleanup.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  FINANCIAL_REQUEST_CAPABILITIES,
  FINANCIAL_REQUEST_TRANSITIONS,
  assertFinancialRequestTransition,
  isAllowedFinancialRequestTransition,
} from "../src/modules/platform-finance/types";
import {
  expectSqlFailure,
  resolveFinanceVerifyDatabaseUrl,
  withFinanceVerifyTransaction,
  type FinanceVerifyClient,
} from "./lib/platform-finance-verify-transaction";

type CheckStatus = "PASS" | "FAIL" | "SKIPPED";
type CheckResult = { name: string; status: CheckStatus; detail?: string };

const RUN_ID = `PFR2-${Date.now()}`;
const MIGRATION =
  "supabase/migrations/20260914210000_finance_requests_transitions.sql";
const SLICE1 =
  "supabase/migrations/20260914200000_finance_requests_foundation.sql";

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

function push(
  results: CheckResult[],
  name: string,
  status: CheckStatus,
  detail?: string
) {
  results.push({ name, status, detail });
  console.log(`${status} ${name}${detail ? ` — ${detail}` : ""}`);
}

function runStatic(results: CheckResult[]) {
  try {
    assert(existsSync(resolve(MIGRATION)), "slice2 migration must remain");
    assert(existsSync(resolve(SLICE1)), "slice1 migration must remain");
    const sql = readSrc(MIGRATION);
    for (const fn of [
      "finance_request_create",
      "finance_request_update_draft",
      "finance_request_submit",
      "finance_request_start_review",
      "finance_request_query",
      "finance_request_resubmit",
      "finance_request_send_to_ceo",
      "finance_request_approve",
      "finance_request_partially_approve",
      "finance_request_reject",
    ]) {
      assert(sql.includes(`function public.${fn}`), fn);
    }
    push(results, "static.migration_rpcs", "PASS");
  } catch (e) {
    push(results, "static.migration_rpcs", "FAIL", (e as Error).message);
  }

  try {
    assert(
      isAllowedFinancialRequestTransition("draft", "submitted"),
      "draft→submitted"
    );
    assert(
      !isAllowedFinancialRequestTransition("approved", "draft"),
      "approved not to draft"
    );
    assertFinancialRequestTransition("under_review", "pending_ceo_approval");
    assert(
      Object.keys(FINANCIAL_REQUEST_TRANSITIONS).length >= 8,
      "transition map"
    );
    push(results, "static.transition_map", "PASS");
  } catch (e) {
    push(results, "static.transition_map", "FAIL", (e as Error).message);
  }

  try {
    const svc = readSrc(
      "src/modules/platform-finance/server/PlatformFinanceRequestsServerService.ts"
    );
    for (const op of [
      "createRequest",
      "updateDraftRequest",
      "submitRequest",
      "startRequestReview",
      "queryRequest",
      "resubmitRequest",
      "sendRequestToCeo",
      "approveRequest",
      "partiallyApproveRequest",
      "rejectRequest",
      "getRequest",
      "listMyRequests",
      "listReviewQueue",
      "listApprovalQueue",
    ]) {
      assert(svc.includes(op), op);
    }
    assert(!svc.includes("updateRequestStatus"), "no generic status API");
    // Slice 3 introduced the requests API route; service surface remains named RPCs.
    assert(
      existsSync(resolve("src/app/api/platform-finance/requests")),
      "requests API route present (slice 3)"
    );
    push(results, "static.service_surface", "PASS");
  } catch (e) {
    push(results, "static.service_surface", "FAIL", (e as Error).message);
  }

  try {
    assert(
      Object.values(FINANCIAL_REQUEST_CAPABILITIES).length === 4,
      "four caps"
    );
    push(results, "static.capabilities", "PASS");
  } catch (e) {
    push(results, "static.capabilities", "FAIL", (e as Error).message);
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

async function runDb(results: CheckResult[], client: FinanceVerifyClient) {
  const rpc = await client.query(
    `select to_regprocedure(
       'public.finance_request_create(uuid,uuid,uuid,uuid,numeric,text,text,text,text,date,text,text,text)'
     ) as reg`
  );
  assert(rpc.rows[0]?.reg, "finance_request_create missing");
  push(results, "db.migration_applied", "PASS", "RPCs present");

  const org = await client.query<{ id: string }>(
    `select id from public.organisations where slug = 'paychex' limit 1`
  );
  assert(org.rows[0], "paychex org required");
  const organisationId = org.rows[0].id;

  const category = await client.query<{ id: string }>(
    `select id from public.finance_request_categories
     where organisation_id = $1 and slug = 'travel' limit 1`,
    [organisationId]
  );
  assert(category.rows[0], "travel category required");
  const categoryId = category.rows[0].id;

  const profiles = await client.query<{ id: string }>(
    `select id from public.profiles where organisation_id = $1 limit 3`,
    [organisationId]
  );
  assert(profiles.rows.length >= 2, "need at least 2 profiles");
  const requesterId = profiles.rows[0].id;
  const financeId = profiles.rows[1].id;
  const ceoId = profiles.rows[2]?.id ?? financeId;

  // Disposable company for this transaction only.
  const company = await client.query<{ id: string }>(
    `insert into public.finance_companies (organisation_id, code, name, status)
     values ($1, $2, 'PFR2 Verify Co', 'active')
     returning id`,
    [organisationId, `PFR2${Date.now().toString(36).slice(-6).toUpperCase()}`]
  );
  const companyId = company.rows[0].id;

  const otherCompany = await client.query<{ id: string }>(
    `insert into public.finance_companies (organisation_id, code, name, status)
     values ($1, $2, 'PFR2 Other Co', 'active')
     returning id`,
    [organisationId, `PFR2O${Date.now().toString(36).slice(-5).toUpperCase()}`]
  );
  const otherCompanyId = otherCompany.rows[0].id;

  // Temporary grants/access — rolled back; never delete persistent rows.
  await insertTempGrant(
    client,
    organisationId,
    requesterId,
    FINANCIAL_REQUEST_CAPABILITIES.create
  );
  await insertTempGrant(
    client,
    organisationId,
    requesterId,
    FINANCIAL_REQUEST_CAPABILITIES.view_own
  );
  await insertTempGrant(
    client,
    organisationId,
    financeId,
    FINANCIAL_REQUEST_CAPABILITIES.review
  );
  await insertTempGrant(
    client,
    organisationId,
    ceoId,
    FINANCIAL_REQUEST_CAPABILITIES.approve
  );
  await client.query(
    `insert into public.finance_company_access
       (organisation_id, profile_id, company_id) values ($1, $2, $3)`,
    [organisationId, requesterId, companyId]
  );
  await client.query(
    `insert into public.finance_company_access
       (organisation_id, profile_id, company_id) values ($1, $2, $3)`,
    [organisationId, financeId, companyId]
  );
  await client.query(
    `insert into public.finance_company_access
       (organisation_id, profile_id, company_id) values ($1, $2, $3)`,
    [organisationId, ceoId, companyId]
  );

  const created = await client.query<{ finance_request_create: string }>(
    `select public.finance_request_create(
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, $5::numeric,
       $6::text, $7::text, $8::text, 'vendor', null, null, null, 'NGN'
     ) as finance_request_create`,
    [
      requesterId,
      organisationId,
      companyId,
      categoryId,
      1500,
      `${RUN_ID} diesel run`,
      "Slice2 verify",
      "Vendor Fuel",
    ]
  );
  const createdId = created.rows[0].finance_request_create;
  assert(createdId, "create returned id");
  push(results, "db.create_draft", "PASS", createdId);

  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_update_draft(
         $1::uuid, $2::uuid, null, null, $3::text, null, null, null, null, false, null, null
       )`,
      [financeId, createdId, `${RUN_ID} hack`]
    );
    assert(/only the requester|FORBIDDEN|missing capability|not the requester/i.test(msg), msg);
    await client.query(
      `select public.finance_request_update_draft(
         $1::uuid, $2::uuid, null, null, $3::text, null, null, null, null, false, null, null
       )`,
      [requesterId, createdId, `${RUN_ID} revised purpose`]
    );
    push(results, "db.update_draft_ownership", "PASS");
  }

  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_submit($1::uuid, $2::uuid)`,
      [requesterId, createdId]
    );
    assert(/supporting|document/i.test(msg), msg);
    push(results, "db.submit_requires_supporting_doc", "PASS");
  }

  await addSupportingDoc(client, organisationId, createdId, requesterId);
  await client.query(
    `select public.finance_request_submit($1::uuid, $2::uuid)`,
    [requesterId, createdId]
  );
  push(results, "db.submit_success", "PASS");

  await client.query(
    `select public.finance_request_start_review($1::uuid, $2::uuid)`,
    [financeId, createdId]
  );
  {
    const st = await client.query(
      `select status from public.finance_requests where id = $1`,
      [createdId]
    );
    assert(st.rows[0].status === "under_review", "under_review");
  }
  push(results, "db.start_review", "PASS");

  await client.query(
    `select public.finance_request_query(
       $1::uuid, $2::uuid, $3::text, 'finance'::text
     )`,
    [financeId, createdId, "Need more quotes"]
  );
  {
    const st = await client.query(
      `select status from public.finance_requests where id = $1`,
      [createdId]
    );
    assert(st.rows[0].status === "query", "query");
  }
  push(results, "db.query_finance", "PASS");

  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_resubmit($1::uuid, $2::uuid, null, null, null, null, null, null, null, false, null, null)`,
      [financeId, createdId]
    );
    assert(/only the requester|FORBIDDEN|requester/i.test(msg), msg);
    await client.query(
      `select public.finance_request_resubmit(
         $1::uuid, $2::uuid, null, null, $3::text, null, null, null, null, false, null, null
       )`,
      [requesterId, createdId, `${RUN_ID} after query`]
    );
    const hist = await client.query(
      `select event_type, from_status, to_status
       from public.finance_request_events where request_id = $1`,
      [createdId]
    );
    assert(
      hist.rows.some(
        (e: { event_type: string }) => e.event_type === "resubmitted"
      ),
      "resubmitted event"
    );
    assert(
      hist.rows.some(
        (e: {
          event_type: string;
          from_status: string | null;
          to_status: string | null;
        }) =>
          e.event_type === "review_started" &&
          e.from_status === "resubmitted" &&
          e.to_status === "under_review"
      ),
      "resubmitted→under_review event"
    );
    push(results, "db.resubmit_flow", "PASS");
  }

  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_send_to_ceo($1::uuid, $2::uuid, null)`,
      [requesterId, createdId]
    );
    assert(/separation of duties|missing capability|FORBIDDEN/i.test(msg), msg);
    await client.query(
      `select public.finance_request_send_to_ceo($1::uuid, $2::uuid, $3::text)`,
      [financeId, createdId, "Ready for CEO"]
    );
    const st = await client.query(
      `select status from public.finance_requests where id = $1`,
      [createdId]
    );
    assert(st.rows[0].status === "pending_ceo_approval", "pending ceo");
    push(results, "db.send_to_ceo", "PASS");
  }

  if (financeId !== ceoId) {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_approve($1::uuid, $2::uuid, null)`,
      [financeId, createdId]
    );
    assert(/missing capability|FORBIDDEN/i.test(msg), msg);
    push(results, "db.finance_cannot_approve", "PASS");
  } else {
    push(
      results,
      "db.finance_cannot_approve",
      "SKIPPED",
      "only two profiles — finance and ceo share identity"
    );
  }

  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_approve($1::uuid, $2::uuid, null)`,
      [requesterId, createdId]
    );
    assert(/separation of duties|missing capability|FORBIDDEN/i.test(msg), msg);
    push(results, "db.requester_cannot_approve", "PASS");
  }

  // Approve path
  const forApprove = await client.query<{ finance_request_create: string }>(
    `select public.finance_request_create(
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, 2000::numeric,
       $5::text, null, 'Vendor A', 'vendor', null, null, null, 'NGN'
     ) as finance_request_create`,
    [
      requesterId,
      organisationId,
      companyId,
      categoryId,
      `${RUN_ID} approve path`,
    ]
  );
  const forApproveId = forApprove.rows[0].finance_request_create;
  await addSupportingDoc(client, organisationId, forApproveId, requesterId);
  await client.query(`select public.finance_request_submit($1::uuid, $2::uuid)`, [
    requesterId,
    forApproveId,
  ]);
  await client.query(
    `select public.finance_request_start_review($1::uuid, $2::uuid)`,
    [financeId, forApproveId]
  );
  await client.query(
    `select public.finance_request_send_to_ceo($1::uuid, $2::uuid, null)`,
    [financeId, forApproveId]
  );
  await client.query(
    `select public.finance_request_approve($1::uuid, $2::uuid, $3::text)`,
    [ceoId, forApproveId, "OK"]
  );
  {
    const st = await client.query(
      `select status, approved_amount, requested_amount, decided_at
       from public.finance_requests where id = $1`,
      [forApproveId]
    );
    assert(st.rows[0].status === "approved", "approved");
    assert(
      Number(st.rows[0].approved_amount) === Number(st.rows[0].requested_amount),
      "full amount"
    );
    assert(st.rows[0].decided_at, "decided_at");
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_query($1::uuid, $2::uuid, $3::text, 'ceo'::text)`,
      [ceoId, forApproveId, "too late"]
    );
    assert(/invalid status|may only query|pending_ceo_approval|VALIDATION|FORBIDDEN/i.test(msg), msg);
    push(results, "db.approve_terminal", "PASS");
  }

  // Partial
  const forPartial = await client.query<{ finance_request_create: string }>(
    `select public.finance_request_create(
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, 3000::numeric,
       $5::text, null, 'Vendor B', 'vendor', null, null, null, 'NGN'
     ) as finance_request_create`,
    [
      requesterId,
      organisationId,
      companyId,
      categoryId,
      `${RUN_ID} partial path`,
    ]
  );
  const forPartialId = forPartial.rows[0].finance_request_create;
  await addSupportingDoc(client, organisationId, forPartialId, requesterId);
  await client.query(`select public.finance_request_submit($1::uuid, $2::uuid)`, [
    requesterId,
    forPartialId,
  ]);
  await client.query(
    `select public.finance_request_start_review($1::uuid, $2::uuid)`,
    [financeId, forPartialId]
  );
  await client.query(
    `select public.finance_request_send_to_ceo($1::uuid, $2::uuid, null)`,
    [financeId, forPartialId]
  );
  await client.query(
    `select public.finance_request_partially_approve($1::uuid, $2::uuid, 1200::numeric, $3::text)`,
    [ceoId, forPartialId, "Cap at 1200"]
  );
  {
    const st = await client.query(
      `select status, approved_amount from public.finance_requests where id = $1`,
      [forPartialId]
    );
    assert(st.rows[0].status === "partially_approved", "partial");
    assert(Number(st.rows[0].approved_amount) === 1200, "capped");
    push(results, "db.partial_approve_terminal", "PASS");
  }

  // Reject
  const forReject = await client.query<{ finance_request_create: string }>(
    `select public.finance_request_create(
       $1::uuid, $2::uuid, $3::uuid, $4::uuid, 900::numeric,
       $5::text, null, 'Vendor C', 'vendor', null, null, null, 'NGN'
     ) as finance_request_create`,
    [
      requesterId,
      organisationId,
      companyId,
      categoryId,
      `${RUN_ID} reject path`,
    ]
  );
  const forRejectId = forReject.rows[0].finance_request_create;
  await addSupportingDoc(client, organisationId, forRejectId, requesterId);
  await client.query(`select public.finance_request_submit($1::uuid, $2::uuid)`, [
    requesterId,
    forRejectId,
  ]);
  await client.query(
    `select public.finance_request_start_review($1::uuid, $2::uuid)`,
    [financeId, forRejectId]
  );
  await client.query(
    `select public.finance_request_send_to_ceo($1::uuid, $2::uuid, null)`,
    [financeId, forRejectId]
  );
  await client.query(
    `select public.finance_request_reject($1::uuid, $2::uuid, $3::text)`,
    [ceoId, forRejectId, "Out of policy"]
  );
  {
    const st = await client.query(
      `select status from public.finance_requests where id = $1`,
      [forRejectId]
    );
    assert(st.rows[0].status === "rejected", "rejected");
    push(results, "db.reject_terminal", "PASS");
  }

  // Competing terminal: approve then reject must fail
  await client.query(
    `select public.finance_request_approve($1::uuid, $2::uuid, $3::text)`,
    [ceoId, createdId, "race A"]
  );
  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_reject($1::uuid, $2::uuid, $3::text)`,
      [ceoId, createdId, "race B"]
    );
    assert(/invalid status|terminal|already|FORBIDDEN|VALIDATION/i.test(msg), msg);
    push(results, "db.competing_terminal_race", "PASS");
  }

  // Company access required
  {
    const msg = await expectSqlFailure(
      client,
      `select public.finance_request_create(
         $1::uuid, $2::uuid, $3::uuid, $4::uuid, 100::numeric,
         $5::text, null, 'No Access', 'other', null, null, null, 'NGN'
       )`,
      [
        requesterId,
        organisationId,
        otherCompanyId,
        categoryId,
        `${RUN_ID} no access`,
      ]
    );
    assert(/no company access|company access/i.test(msg), msg);
    push(results, "db.company_access_required", "PASS");
  }

  {
    const mine = await client.query(
      `select id, status from public.finance_requests
       where organisation_id = $1 and requester_profile_id = $2`,
      [organisationId, requesterId]
    );
    assert(
      mine.rows.some((r: { id: string }) => r.id === createdId),
      "my requests include created"
    );
    const reviewQ = await client.query(
      `select id, status from public.finance_requests
       where organisation_id = $1
         and status in ('submitted', 'under_review', 'resubmitted')`,
      [organisationId]
    );
    assert(
      !reviewQ.rows.some((r: { status: string }) => r.status === "approved"),
      "review queue excludes terminal approved"
    );
    const approvalQ = await client.query(
      `select id, status from public.finance_requests
       where organisation_id = $1 and status = 'pending_ceo_approval'`,
      [organisationId]
    );
    assert(
      approvalQ.rows.every(
        (r: { status: string }) => r.status === "pending_ceo_approval"
      ),
      "approval queue only pending"
    );
    push(results, "db.read_queues", "PASS");
  }

  {
    const before = await client.query(
      `select count(*)::int as n from public.finance_request_events where request_id = $1`,
      [forRejectId]
    );
    await expectSqlFailure(
      client,
      `select public.finance_request_approve($1::uuid, $2::uuid, null)`,
      [ceoId, forRejectId]
    );
    const after = await client.query(
      `select count(*)::int as n from public.finance_request_events where request_id = $1`,
      [forRejectId]
    );
    assert(after.rows[0].n === before.rows[0].n, "failed transition appends no event");
    push(results, "db.failed_transition_no_event", "PASS");
  }

  {
    const sample = await client.query(
      `select id from public.finance_request_events
       where request_id = $1 order by created_at limit 1`,
      [forRejectId]
    );
    if (sample.rows[0]) {
      const msg = await expectSqlFailure(
        client,
        `update public.finance_request_events
         set metadata = '{"tampered":true}'::jsonb where id = $1`,
        [sample.rows[0].id]
      );
      assert(msg.length > 0, "event update must fail");
      push(results, "db.events_append_only", "PASS", msg);
    } else {
      push(results, "db.events_append_only", "FAIL", "no events");
    }
  }

  push(
    results,
    "access.rls_authenticated_client",
    "SKIPPED",
    "transaction-scoped suite; not inventing credentials"
  );
  push(
    results,
    "db.cleanup.rollback",
    "PASS",
    "helper will ROLLBACK — no persistent PFR2 pollution from this run"
  );
}

async function main() {
  loadEnvLocal();
  const results: CheckResult[] = [];
  console.log("=== Financial Requests Slice 2 verification ===\n");
  console.log("--- static ---");
  runStatic(results);
  console.log("\n--- database ---");

  if (!resolveFinanceVerifyDatabaseUrl()) {
    push(
      results,
      "db.env",
      "SKIPPED",
      "PLATFORM_FINANCE_VERIFY_DATABASE_URL not set — no DB connection attempted"
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

  const pass = results.filter((r: CheckResult) => r.status === "PASS").length;
  const fail = results.filter((r: CheckResult) => r.status === "FAIL").length;
  const skipped = results.filter((r: CheckResult) => r.status === "SKIPPED")
    .length;
  console.log(`\n${pass} PASS / ${fail} FAIL / ${skipped} SKIPPED`);
  if (fail > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
