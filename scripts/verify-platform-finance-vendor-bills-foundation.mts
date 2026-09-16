/**
 * Platform Finance — Vendor Bill / External Obligation foundation verification.
 *
 *   npx tsx --tsconfig tsconfig.json scripts/verify-platform-finance-vendor-bills-foundation.mts
 *
 * Static checks always run.
 * Unauthenticated handler checks run without inventing credentials.
 * Optional DB suite (PLATFORM_FINANCE_VERIFY_DATABASE_URL) proves lifecycle +
 * bypass + atomic CEO→Payable in a rolled-back transaction.
 *
 * No UI. No Command Centre. No banking/posting.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { GET, POST } from "../src/app/api/platform-finance/vendor-bills/route";
import {
  FINANCE_VENDOR_BILL_CAPABILITIES,
  FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,
  FINANCE_VENDOR_BILL_INVARIANTS,
  FINANCE_VENDOR_BILL_SEPARATION_OF_DUTIES,
  FINANCE_VENDOR_BILL_STATUSES,
  FINANCE_VENDOR_BILL_TRANSITIONS,
  FINANCIAL_REQUEST_CAPABILITIES,
  PLATFORM_FINANCE_CAPABILITIES,
  isAllowedFinanceVendorBillTransition,
} from "../src/modules/platform-finance/types";
import {
  expectSqlFailure,
  resolveFinanceVerifyDatabaseUrl,
  withFinanceVerifyTransaction,
  type FinanceVerifyClient,
} from "./lib/platform-finance-verify-transaction";

type CheckStatus = "PASS" | "FAIL" | "SKIPPED";
type CheckResult = { name: string; status: CheckStatus; detail?: string };

const ROUTE = "src/app/api/platform-finance/vendor-bills/route.ts";
const CLIENT =
  "src/services/platform-finance/PlatformFinanceVendorBillsService.ts";
const SERVICE =
  "src/modules/platform-finance/server/PlatformFinanceVendorBillsServerService.ts";
const REPO =
  "src/modules/platform-finance/server/PlatformFinanceVendorBillsRepository.ts";
const TRANSITIONS =
  "src/modules/platform-finance/server/vendorBillTransitions.ts";
const DOMAIN = "src/modules/platform-finance/domain/vendorBills.ts";
const FOUNDATION_MIGRATION =
  "supabase/migrations/20260916120000_finance_vendor_bills_foundation.sql";
const LIFECYCLE_MIGRATION =
  "supabase/migrations/20260916121000_finance_vendor_bills_lifecycle.sql";
const STORAGE_MIGRATION =
  "supabase/migrations/20260916122000_finance_vendor_bill_documents_storage.sql";
const PAYABLES_ROUTE = "src/app/api/platform-finance/payables/route.ts";
const PAYABLES_SERVICE =
  "src/modules/platform-finance/server/PlatformFinancePayablesServerService.ts";

const EXPECTED_ACTIONS = [
  "getVendorBill",
  "getVendorBillDetail",
  "listMyVendorBills",
  "listAccessibleVendorBills",
  "listReviewQueue",
  "listApprovalQueue",
  "listAccessibleCompanies",
  "getMyVendorBillCapabilities",
  "createVendorBill",
  "updateDraftVendorBill",
  "submitVendorBill",
  "startReview",
  "queryVendorBill",
  "resubmitVendorBill",
  "sendToCeo",
  "approveVendorBill",
  "partiallyApproveVendorBill",
  "rejectVendorBill",
  "uploadDocument",
  "removeDocument",
  "supersedeDocument",
  "getDocumentSignedUrl",
] as const;

const LIFECYCLE_RPCS = [
  "finance_vendor_bill_create",
  "finance_vendor_bill_update_draft",
  "finance_vendor_bill_submit",
  "finance_vendor_bill_start_review",
  "finance_vendor_bill_query",
  "finance_vendor_bill_resubmit",
  "finance_vendor_bill_send_to_ceo",
  "finance_vendor_bill_approve",
  "finance_vendor_bill_partially_approve",
  "finance_vendor_bill_reject",
  "finance_payable_insert_from_approved_vendor_bill",
] as const;

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

function collectTsFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = resolve(dir, entry.name);
    if (entry.isDirectory()) out.push(...collectTsFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) out.push(full);
  }
  return out;
}

async function runStatic(results: CheckResult[]) {
  for (const path of [
    FOUNDATION_MIGRATION,
    LIFECYCLE_MIGRATION,
    STORAGE_MIGRATION,
    DOMAIN,
    REPO,
    SERVICE,
    TRANSITIONS,
    ROUTE,
    CLIENT,
  ]) {
    try {
      assert(existsSync(resolve(path)), `missing ${path}`);
      push(results, `files.${path.split("/").pop()}`, "PASS");
    } catch (e) {
      push(results, `files.${path.split("/").pop()}`, "FAIL", (e as Error).message);
    }
  }

  const foundation = readSrc(FOUNDATION_MIGRATION);
  const lifecycle = readSrc(LIFECYCLE_MIGRATION);
  const storage = readSrc(STORAGE_MIGRATION);
  const domain = readSrc(DOMAIN);
  const route = readSrc(ROUTE);
  const client = readSrc(CLIENT);
  const service = readSrc(SERVICE);
  const transitions = readSrc(TRANSITIONS);
  const payablesRoute = readSrc(PAYABLES_ROUTE);
  const payablesService = readSrc(PAYABLES_SERVICE);

  try {
    assert(foundation.includes("create table public.finance_vendor_bills"), "table");
    assert(
      foundation.includes("create table public.finance_vendor_bill_documents"),
      "documents"
    );
    assert(
      foundation.includes("create table public.finance_vendor_bill_events"),
      "events"
    );
    assert(
      foundation.includes("platform_finance.vendor_bill.view") &&
        foundation.includes("platform_finance.vendor_bill.create") &&
        foundation.includes("platform_finance.vendor_bill.review"),
      "caps in RLS"
    );
    assert(
      !foundation.includes("platform_finance.vendor_bill.approve"),
      "no vendor_bill.approve"
    );
    assert(
      foundation.includes("platform_finance.request.approve"),
      "CEO reuses request.approve"
    );
    push(results, "A.foundation_schema_rls", "PASS");
  } catch (e) {
    push(results, "A.foundation_schema_rls", "FAIL", (e as Error).message);
  }

  try {
    for (const rpc of LIFECYCLE_RPCS) {
      assert(lifecycle.includes(`function public.${rpc}`), rpc);
      assert(transitions.includes(rpc) || rpc.includes("insert_from"), `${rpc} wired or internal`);
    }
    for (const rpc of [
      "finance_vendor_bill_create",
      "finance_vendor_bill_approve",
      "finance_vendor_bill_partially_approve",
      "finance_vendor_bill_reject",
    ]) {
      assert(transitions.includes(`"${rpc}"`) || transitions.includes(`'${rpc}'`), rpc);
    }
    assert(
      lifecycle.includes("direct payable creation is disabled"),
      "create bypass guard"
    );
    assert(
      lifecycle.includes("finance_payable_insert_from_approved_vendor_bill"),
      "atomic insert helper"
    );
    assert(
      /finance_vendor_bill_approve[\s\S]*finance_payable_insert_from_approved_vendor_bill/.test(
        lifecycle
      ),
      "approve calls insert"
    );
    push(results, "B.lifecycle_rpcs_atomic_payable", "PASS");
  } catch (e) {
    push(results, "B.lifecycle_rpcs_atomic_payable", "FAIL", (e as Error).message);
  }

  try {
    assert(storage.includes("finance-vendor-bill-documents"), "bucket");
    assert(storage.includes("storage.buckets"), "storage.buckets");
    push(results, "C.documents_storage_bucket", "PASS");
  } catch (e) {
    push(results, "C.documents_storage_bucket", "FAIL", (e as Error).message);
  }

  try {
    assert(FINANCE_VENDOR_BILL_STATUSES.length === 9, "9 statuses");
    assert(
      isAllowedFinanceVendorBillTransition("draft", "submitted"),
      "draft→submitted"
    );
    assert(
      !isAllowedFinanceVendorBillTransition("under_review", "approved"),
      "finance cannot approve"
    );
    assert(
      isAllowedFinanceVendorBillTransition("pending_ceo_approval", "approved"),
      "ceo approve"
    );
    assert(
      FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY ===
        FINANCIAL_REQUEST_CAPABILITIES.approve &&
        FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY ===
          PLATFORM_FINANCE_CAPABILITIES.request_approve,
      "CEO cap is request.approve"
    );
    assert(
      !Object.values(FINANCE_VENDOR_BILL_CAPABILITIES).some((c) =>
        c.endsWith(".approve")
      ),
      "no vendor_bill.approve capability"
    );
    assert(FINANCE_VENDOR_BILL_INVARIANTS.approvalCreatesPayableAtomically, "atomic");
    assert(FINANCE_VENDOR_BILL_INVARIANTS.directPayableCreateIsBlocked, "bypass blocked");
    assert(FINANCE_VENDOR_BILL_SEPARATION_OF_DUTIES.financeMustNotApprove, "SoD");
    assert(domain.includes("Vendor Bill is upstream of Payable"), "boundary comment");
    push(results, "D.domain_machine_and_caps", "PASS");
  } catch (e) {
    push(results, "D.domain_machine_and_caps", "FAIL", (e as Error).message);
  }

  try {
    for (const action of EXPECTED_ACTIONS) {
      assert(route.includes(`case "${action}"`), action);
    }
    assert(!route.includes('case "createPayable"'), "no createPayable");
    assert(!route.includes("updateVendorBillStatus"), "no generic status");
    assert(route.includes("FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY"), "CEO gate");
    assert(
      route.includes("capability: FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY") ||
        route.includes("FINANCE_VENDOR_BILL_CEO_APPROVAL_CAPABILITY,"),
      "approve uses request.approve"
    );
    push(results, "E.api_named_actions", "PASS");
  } catch (e) {
    push(results, "E.api_named_actions", "FAIL", (e as Error).message);
  }

  try {
    assert(client.includes('API_PATH = "/api/platform-finance/vendor-bills"'), "path");
    for (const m of [
      "createVendorBill",
      "submitVendorBill",
      "sendToCeo",
      "approveVendorBill",
      "partiallyApproveVendorBill",
      "rejectVendorBill",
      "uploadDocument",
    ]) {
      assert(client.includes(`${m}(`), m);
    }
    assert(!/\bcreatePayable\s*\(/.test(client), "client no createPayable method");
    push(results, "F.client_service", "PASS");
  } catch (e) {
    push(results, "F.client_service", "FAIL", (e as Error).message);
  }

  try {
    assert(service.includes("rpcApproveFinanceVendorBill"), "approve rpc");
    assert(service.includes("rpcPartiallyApproveFinanceVendorBill"), "partial rpc");
    assert(!service.includes("rpcCreateFinancePayable"), "no payable create");
    assert(
      service.includes("The Payable is never created here") ||
        service.includes("never created here"),
      "comment"
    );
    push(results, "G.server_no_followup_payable", "PASS");
  } catch (e) {
    push(results, "G.server_no_followup_payable", "FAIL", (e as Error).message);
  }

  try {
    assert(
      payablesRoute.includes("Direct payable creation is not supported") ||
        payablesRoute.includes("Direct payable creation is not"),
      "API refuse"
    );
    assert(
      payablesService.includes("Direct payable creation is not permitted") ||
        payablesService.includes("Promise<never>"),
      "service refuse"
    );
    assert(
      !payablesService.includes("rpcCreateFinancePayable"),
      "service does not call create rpc"
    );
    push(results, "H.direct_payable_bypass_blocked", "PASS");
  } catch (e) {
    push(results, "H.direct_payable_bypass_blocked", "FAIL", (e as Error).message);
  }

  try {
    // UI routes are expected after the Vendor Bills UI slice. Banking / Command
    // Centre / inventing vendor_bill.approve remain out of scope.
    assert(
      existsSync(resolve("src/app/(app)/platform-finance/vendor-bills/page.tsx")),
      "vendor bills register route"
    );
    assert(
      existsSync(
        resolve("src/app/(app)/platform-finance/vendor-bills/new/page.tsx")
      ),
      "create vendor bill route"
    );
    assert(
      existsSync(
        resolve("src/app/(app)/platform-finance/vendor-bills/[id]/page.tsx")
      ),
      "vendor bill detail route"
    );
    assert(
      !/\bplatform_finance\.vendor_bill\.approve\b/.test(route) &&
        !/\bFINANCE_VENDOR_BILL_CAPABILITIES\.approve\b/.test(route),
      "no vendor_bill.approve capability wiring"
    );
    assert(!/\bschedulePayment\s*\(/.test(route), "no schedulePayment");
    assert(!/\bmarkPaid\s*\(/.test(route), "no markPaid");
    assert(!/\bpostVendorBill\s*\(/.test(route), "no postVendorBill");
    assert(!route.toLowerCase().includes("command-centre"), "no CC");
    assert(!client.toLowerCase().includes("command-centre"), "client no CC");
    assert(!/\bcreatePayable\s*\(/.test(route), "route no createPayable");
    assert(!/\bcreatePayable\s*\(/.test(client), "client no createPayable");
    push(results, "I.ui_routes_no_banking_no_cc", "PASS");
  } catch (e) {
    push(results, "I.ui_routes_no_banking_no_cc", "FAIL", (e as Error).message);
  }

  try {
    const expectedEdges: Array<[keyof typeof FINANCE_VENDOR_BILL_TRANSITIONS, string]> = [
      ["draft", "submitted"],
      ["submitted", "under_review"],
      ["under_review", "query"],
      ["under_review", "pending_ceo_approval"],
      ["query", "resubmitted"],
      ["resubmitted", "under_review"],
      ["pending_ceo_approval", "approved"],
      ["pending_ceo_approval", "partially_approved"],
      ["pending_ceo_approval", "rejected"],
      ["pending_ceo_approval", "query"],
    ];
    for (const [from, to] of expectedEdges) {
      assert(
        (FINANCE_VENDOR_BILL_TRANSITIONS[from] as readonly string[]).includes(to),
        `${from}→${to}`
      );
    }
    push(results, "J.transition_table", "PASS");
  } catch (e) {
    push(results, "J.transition_table", "FAIL", (e as Error).message);
  }
}

async function runHandlers(results: CheckResult[]) {
  try {
    const res = await GET();
    const json = (await res.json()) as {
      success?: boolean;
      code?: string;
      message?: string;
    };
    assert(res.status === 401, `expected 401 got ${res.status}`);
    assert(json.success === false, "success false");
    push(results, "handler.get_unauthenticated", "PASS", `status=${res.status}`);
  } catch (e) {
    push(results, "handler.get_unauthenticated", "FAIL", (e as Error).message);
  }

  try {
    const res = await POST(
      new Request("http://localhost/api/platform-finance/vendor-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createVendorBill",
          input: {},
        }),
      })
    );
    const json = (await res.json()) as { success?: boolean };
    assert(res.status === 401, `expected 401 got ${res.status}`);
    assert(json.success === false, "success false");
    push(results, "handler.post_unauthenticated", "PASS", `status=${res.status}`);
  } catch (e) {
    push(results, "handler.post_unauthenticated", "FAIL", (e as Error).message);
  }

  try {
    const res = await POST(
      new Request("http://localhost/api/platform-finance/vendor-bills", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "createPayable",
          input: { sourceId: randomUUID() },
        }),
      })
    );
    const json = (await res.json()) as { success?: boolean; message?: string };
    assert(res.status === 401 || res.status === 400, `got ${res.status}`);
    if (res.status === 400) {
      assert(/unknown action/i.test(json.message ?? ""), json.message ?? "");
    }
    push(
      results,
      "handler.rejects_createPayable_action",
      "PASS",
      `status=${res.status}`
    );
  } catch (e) {
    push(
      results,
      "handler.rejects_createPayable_action",
      "FAIL",
      (e as Error).message
    );
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
     on conflict do nothing`,
    [organisationId, profileId, capability]
  );
}

async function runDatabase(results: CheckResult[]) {
  const dbUrl = resolveFinanceVerifyDatabaseUrl();
  if (!dbUrl) {
    push(
      results,
      "db.suite",
      "SKIPPED",
      "PLATFORM_FINANCE_VERIFY_DATABASE_URL / DATABASE_URL not set"
    );
    return;
  }

  try {
    await withFinanceVerifyTransaction(async (client) => {
      const org = await client.query<{ id: string }>(
        `select id from public.organisations where status = 'active' order by created_at limit 1`
      );
      assert(org.rows[0], "need organisation");
      const organisationId = org.rows[0].id;

      const profiles = await client.query<{ id: string }>(
        `select id from public.profiles
         where organisation_id = $1 order by created_at limit 4`,
        [organisationId]
      );
      assert(profiles.rows.length >= 3, "need ≥3 profiles");
      const inputterId = profiles.rows[0].id;
      const financeId = profiles.rows[1].id;
      const ceoId = profiles.rows[2].id;

      const company = await client.query<{ id: string }>(
        `insert into public.finance_companies (organisation_id, code, name, status)
         values ($1, $2, 'VB Foundation Co', 'active') returning id`,
        [organisationId, `VB${Date.now().toString(36).slice(-6).toUpperCase()}`]
      );
      const companyId = company.rows[0].id;

      for (const pid of [inputterId, financeId, ceoId]) {
        await client.query(
          `insert into public.finance_company_access
             (organisation_id, profile_id, company_id) values ($1, $2, $3)
           on conflict do nothing`,
          [organisationId, pid, companyId]
        );
      }

      await insertTempGrant(
        client,
        organisationId,
        inputterId,
        FINANCE_VENDOR_BILL_CAPABILITIES.create
      );
      await insertTempGrant(
        client,
        organisationId,
        financeId,
        FINANCE_VENDOR_BILL_CAPABILITIES.review
      );
      await insertTempGrant(
        client,
        organisationId,
        ceoId,
        FINANCIAL_REQUEST_CAPABILITIES.approve
      );

      // Bypass: direct payable create must fail for vendor_bill and financial_request.
      {
        const msg = await expectSqlFailure(
          client,
          `select public.finance_payable_create(
             $1::uuid, $2::uuid, 'Bypass', 'vendor', 100::numeric,
             'vendor_bill', $3::uuid, 'NGN', null, null, null, null
           )`,
          [inputterId, companyId, randomUUID()]
        );
        assert(/direct payable creation is disabled/i.test(msg), msg);
        push(results, "db.bypass.vendor_bill_create_refused", "PASS", msg);
      }
      {
        const msg = await expectSqlFailure(
          client,
          `select public.finance_payable_create(
             $1::uuid, $2::uuid, 'Bypass', 'vendor', 100::numeric,
             'financial_request', $3::uuid, 'NGN', null, null, null, null
           )`,
          [inputterId, companyId, randomUUID()]
        );
        assert(/direct payable creation is disabled/i.test(msg), msg);
        push(results, "db.bypass.financial_request_create_refused", "PASS", msg);
      }

      // Happy path: draft → submit → review → CEO → Payable
      const created = await client.query<{ id: string }>(
        `select public.finance_vendor_bill_create(
           $1::uuid, $2::uuid, $3::uuid, 2500::numeric,
           'Office supplies invoice', 'Acme Supplies', 'vendor',
           'Toner and paper', 'INV-VB-1', current_date, true,
           current_date + 14, null, 'NGN'
         ) as id`,
        [inputterId, organisationId, companyId]
      );
      const billId = created.rows[0].id;
      assert(billId, "created");
      push(results, "db.lifecycle.create_draft", "PASS", billId);

      // Submit requires a document + goods received (goods already true).
      await client.query(
        `insert into public.finance_vendor_bill_documents (
           organisation_id, vendor_bill_id, uploaded_by_profile_id,
           filename, mime_type, byte_size, storage_bucket, storage_path, document_role
         ) values (
           $1, $2, $3, 'invoice.pdf', 'application/pdf', 128,
           'finance-vendor-bill-documents', $4, 'supporting'
         )`,
        [
          organisationId,
          billId,
          inputterId,
          `${organisationId}/${companyId}/${billId}/${randomUUID()}/invoice.pdf`,
        ]
      );

      await client.query(
        `select public.finance_vendor_bill_submit($1::uuid, $2::uuid)`,
        [inputterId, billId]
      );
      push(results, "db.lifecycle.submit", "PASS");

      await client.query(
        `select public.finance_vendor_bill_start_review($1::uuid, $2::uuid)`,
        [financeId, billId]
      );
      push(results, "db.lifecycle.start_review", "PASS");

      // Finance must not approve.
      {
        const msg = await expectSqlFailure(
          client,
          `select public.finance_vendor_bill_approve($1::uuid, $2::uuid, null)`,
          [financeId, billId]
        );
        assert(/missing capability|separation of duties|invalid status/i.test(msg), msg);
        push(results, "db.sod.finance_cannot_approve", "PASS", msg);
      }

      await client.query(
        `select public.finance_vendor_bill_send_to_ceo($1::uuid, $2::uuid, $3::text)`,
        [financeId, billId, "Looks complete"]
      );
      push(results, "db.lifecycle.send_to_ceo", "PASS");

      await client.query(
        `select public.finance_vendor_bill_approve($1::uuid, $2::uuid, $3::text)`,
        [ceoId, billId, "Approved"]
      );

      {
        const bill = await client.query(
          `select status, billed_amount, approved_amount
           from public.finance_vendor_bills where id = $1`,
          [billId]
        );
        assert(bill.rows[0].status === "approved", "status approved");
        assert(Number(bill.rows[0].approved_amount) === 2500, "approved amount");
        assert(Number(bill.rows[0].billed_amount) === 2500, "billed unchanged");

        const pays = await client.query(
          `select id, status, payable_amount, source_type, source_id
           from public.finance_payables
           where source_type = 'vendor_bill' and source_id = $1`,
          [billId]
        );
        assert(pays.rows.length === 1, "exactly one payable");
        assert(pays.rows[0].status === "approved", "payable approved");
        assert(Number(pays.rows[0].payable_amount) === 2500, "payable amount");
        push(results, "db.lifecycle.approve_creates_payable_atomically", "PASS");
      }

      // Duplicate payable blocked.
      {
        const msg = await expectSqlFailure(
          client,
          `select public.finance_payable_insert_from_approved_vendor_bill(
             $1::uuid, $2::uuid, 2500::numeric
           )`,
          [ceoId, billId]
        );
        assert(/already exists|duplicate|unique/i.test(msg), msg);
        push(results, "db.idempotency.no_duplicate_payable", "PASS", msg);
      }

      // Partial approval path on a second bill.
      const partial = await client.query<{ id: string }>(
        `select public.finance_vendor_bill_create(
           $1::uuid, $2::uuid, $3::uuid, 4000::numeric,
           'Partial bill', 'Beta Co', 'vendor',
           null, 'INV-VB-2', current_date, true,
           null, null, 'NGN'
         ) as id`,
        [inputterId, organisationId, companyId]
      );
      const partialId = partial.rows[0].id;
      await client.query(
        `insert into public.finance_vendor_bill_documents (
           organisation_id, vendor_bill_id, uploaded_by_profile_id,
           filename, mime_type, byte_size, storage_bucket, storage_path, document_role
         ) values (
           $1, $2, $3, 'p.pdf', 'application/pdf', 64,
           'finance-vendor-bill-documents', $4, 'supporting'
         )`,
        [
          organisationId,
          partialId,
          inputterId,
          `${organisationId}/${companyId}/${partialId}/${randomUUID()}/p.pdf`,
        ]
      );
      await client.query(
        `select public.finance_vendor_bill_submit($1::uuid, $2::uuid)`,
        [inputterId, partialId]
      );
      await client.query(
        `select public.finance_vendor_bill_start_review($1::uuid, $2::uuid)`,
        [financeId, partialId]
      );
      await client.query(
        `select public.finance_vendor_bill_send_to_ceo($1::uuid, $2::uuid, null)`,
        [financeId, partialId]
      );
      await client.query(
        `select public.finance_vendor_bill_partially_approve(
           $1::uuid, $2::uuid, 1500::numeric, 'Partial ok'
         )`,
        [ceoId, partialId]
      );
      {
        const bill = await client.query(
          `select status, approved_amount from public.finance_vendor_bills where id = $1`,
          [partialId]
        );
        assert(bill.rows[0].status === "partially_approved", "partial status");
        assert(Number(bill.rows[0].approved_amount) === 1500, "partial amount");
        const pays = await client.query(
          `select payable_amount, status from public.finance_payables
           where source_type = 'vendor_bill' and source_id = $1`,
          [partialId]
        );
        assert(pays.rows.length === 1, "one partial payable");
        assert(Number(pays.rows[0].payable_amount) === 1500, "payable=approved");
        push(results, "db.lifecycle.partial_approve_creates_payable", "PASS");
      }

      // Rejection creates no payable.
      const reject = await client.query<{ id: string }>(
        `select public.finance_vendor_bill_create(
           $1::uuid, $2::uuid, $3::uuid, 900::numeric,
           'Reject bill', 'Gamma Co', 'vendor',
           null, null, null, true, null, null, 'NGN'
         ) as id`,
        [inputterId, organisationId, companyId]
      );
      const rejectId = reject.rows[0].id;
      await client.query(
        `insert into public.finance_vendor_bill_documents (
           organisation_id, vendor_bill_id, uploaded_by_profile_id,
           filename, mime_type, byte_size, storage_bucket, storage_path, document_role
         ) values (
           $1, $2, $3, 'r.pdf', 'application/pdf', 32,
           'finance-vendor-bill-documents', $4, 'supporting'
         )`,
        [
          organisationId,
          rejectId,
          inputterId,
          `${organisationId}/${companyId}/${rejectId}/${randomUUID()}/r.pdf`,
        ]
      );
      await client.query(
        `select public.finance_vendor_bill_submit($1::uuid, $2::uuid)`,
        [inputterId, rejectId]
      );
      await client.query(
        `select public.finance_vendor_bill_start_review($1::uuid, $2::uuid)`,
        [financeId, rejectId]
      );
      await client.query(
        `select public.finance_vendor_bill_send_to_ceo($1::uuid, $2::uuid, null)`,
        [financeId, rejectId]
      );
      await client.query(
        `select public.finance_vendor_bill_reject($1::uuid, $2::uuid, $3::text)`,
        [ceoId, rejectId, "Not authorised"]
      );
      {
        const pays = await client.query(
          `select count(*)::int as n from public.finance_payables
           where source_type = 'vendor_bill' and source_id = $1`,
          [rejectId]
        );
        assert(pays.rows[0].n === 0, "no payable on reject");
        push(results, "db.lifecycle.reject_creates_no_payable", "PASS");
      }
    });
  } catch (e) {
    push(results, "db.suite", "FAIL", (e as Error).message);
  }
}

async function main() {
  const results: CheckResult[] = [];
  console.log("Platform Finance — Vendor Bill foundation verification\n");
  await runStatic(results);
  await runHandlers(results);
  await runDatabase(results);

  const failed = results.filter((r) => r.status === "FAIL");
  const passed = results.filter((r) => r.status === "PASS");
  const skipped = results.filter((r) => r.status === "SKIPPED");
  console.log(
    `\nSummary: ${passed.length} PASS, ${failed.length} FAIL, ${skipped.length} SKIPPED`
  );
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
